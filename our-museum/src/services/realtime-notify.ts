import "server-only";
import { SignJWT } from "jose";
import { env, realtimeTicketSecret } from "@/lib/env";
import { logger } from "@/lib/logger";

async function internalToken() {
  return new SignJWT({ typ: "internal" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("60s")
    .setAudience("our-museum-realtime-internal")
    .sign(new TextEncoder().encode(realtimeTicketSecret()));
}

async function post(path: string, body: unknown) {
  const url = `${env().REALTIME_INTERNAL_URL.replace(/\/$/, "")}${path}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${await internalToken()}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) logger.warn("realtime_notify_failed", { path, status: res.status });
  } catch (error) {
    // The realtime service is optional for persistence; clients refetch on reconnect.
    logger.debug("realtime_notify_unreachable", { path, error: error instanceof Error ? error.message : String(error) });
  }
}

export type ChangeScope = "layout" | "photos" | "museum" | "members" | "tours";

/** Tells connected visitors that persisted museum data changed (they refetch it). */
export function notifyMuseumChanged(museumId: string, scope: ChangeScope, actorId?: string) {
  void post("/internal/broadcast", { museumId, event: { type: "museum.changed", scope, actorId: actorId ?? null } });
}

/** Disconnects a removed member (or everyone, when a museum is deleted). */
export function kickFromMuseum(museumId: string, userId: string | null, reason: "removed" | "deleted") {
  void post("/internal/kick", { museumId, userId, reason });
}
