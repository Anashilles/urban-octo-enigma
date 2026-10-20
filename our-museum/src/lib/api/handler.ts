import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { AppError, errors, isAppError } from "@/lib/errors";
import { logger, reportError } from "@/lib/logger";
import { apiLimiter, RATE_RULES } from "@/lib/rate-limit";

type RuleName = keyof typeof RATE_RULES;
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "local";
}

/**
 * CSRF defence for cookie-authenticated mutations: the request must originate
 * from our own origin. Browsers always send `Origin` on cross-site POSTs, and
 * session cookies are SameSite=Lax as a second layer.
 */
export function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const appOrigin = new URL(env().APP_URL).origin;
  const requestOrigin = new URL(req.url).origin;
  if (origin && (origin === appOrigin || origin === requestOrigin)) return;
  const site = req.headers.get("sec-fetch-site");
  if (!origin && (site === "same-origin" || site === null)) return; // non-browser clients without Origin
  throw errors.forbidden("Cross-site request blocked");
}

export function limit(key: string, rule: RuleName, cost = 1) {
  const result = apiLimiter.take(`${rule}:${key}`, RATE_RULES[rule], cost);
  if (!result.ok) throw errors.rateLimited(result.retryAfterSeconds);
}

export async function parseJson<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw errors.badRequest("Request body must be valid JSON");
  }
  return parseWith(schema, body);
}

export function parseWith<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw errors.validation(
      "Validation failed",
      result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    );
  }
  return result.data;
}

export function json(data: unknown, init?: number | ResponseInit) {
  const responseInit: ResponseInit = typeof init === "number" ? { status: init } : (init ?? {});
  const headers = new Headers(responseInit.headers);
  if (!headers.has("cache-control")) headers.set("cache-control", "no-store");
  return NextResponse.json(data, { ...responseInit, headers });
}

export function errorResponse(error: AppError) {
  const headers: Record<string, string> = {};
  const retry = (error.details as { retryAfterSeconds?: number } | undefined)?.retryAfterSeconds;
  if (error.code === "RATE_LIMITED" && retry) headers["retry-after"] = String(retry);
  return json(
    { error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) } },
    { status: error.status, headers },
  );
}

interface HandlerOptions {
  /** Extra IP-based rate-limit rule applied before the handler runs. */
  rate?: RuleName;
  /** Skip the same-origin check (only for endpoints authenticated by other means, e.g. signed URLs, cron secrets). */
  skipCsrf?: boolean;
}

type RouteContext<P> = { params: Promise<P> };

/**
 * Wraps a route handler with consistent error handling, same-origin checks for
 * mutations and IP rate limiting. Handlers throw `AppError`s; anything else is
 * logged and returned as a generic 500 without internals.
 */
export function apiHandler<P = Record<string, string>>(
  fn: (req: NextRequest, params: P) => Promise<Response>,
  options: HandlerOptions = {},
) {
  return async (req: NextRequest, ctx: RouteContext<P>): Promise<Response> => {
    const started = Date.now();
    try {
      const ip = clientIp(req);
      limit(ip, "api");
      if (MUTATING.has(req.method)) {
        if (!options.skipCsrf) assertSameOrigin(req);
        limit(ip, "mutation");
      }
      if (options.rate) limit(ip, options.rate);
      const params = ctx?.params ? await ctx.params : ({} as P);
      return await fn(req, params);
    } catch (error) {
      if (isAppError(error)) {
        if (error.status >= 500) reportError(error, { path: new URL(req.url).pathname });
        return errorResponse(error);
      }
      reportError(error, { path: new URL(req.url).pathname, method: req.method });
      return errorResponse(new AppError("INTERNAL", "Something went wrong on our side."));
    } finally {
      const ms = Date.now() - started;
      if (ms > 2000) logger.warn("slow_request", { path: new URL(req.url).pathname, method: req.method, ms });
    }
  };
}
