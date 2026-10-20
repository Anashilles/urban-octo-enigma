import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { isLocale, type Locale } from "@/i18n/config";
import { env } from "@/lib/env";
import { errors } from "@/lib/errors";
import { auth } from "./server";

export interface SessionUser {
  id: string;
  displayName: string;
  email: string;
  emailVerified: boolean;
  isAnonymous: boolean;
  locale: Locale;
  isAdmin: boolean;
}

function toSessionUser(user: Record<string, unknown>): SessionUser {
  const email = String(user.email ?? "");
  return {
    id: String(user.id),
    displayName: String(user.name ?? user.displayName ?? ""),
    email,
    emailVerified: Boolean(user.emailVerified),
    isAnonymous: Boolean(user.isAnonymous),
    locale: isLocale(user.locale) ? user.locale : "en",
    isAdmin: !user.isAnonymous && env().ADMIN_EMAILS.map((a) => a.toLowerCase()).includes(email.toLowerCase()),
  };
}

/** Resolves the signed-in user from request headers (route handlers). */
export async function getUserFromHeaders(h: Headers): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers: h });
  return session ? toSessionUser(session.user as unknown as Record<string, unknown>) : null;
}

/** Resolves the signed-in user for server components (memoised per request). */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  return getUserFromHeaders(await headers());
});

/** For server components: redirect to sign-in when there is no session. */
export async function requirePageUser(returnTo?: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login${returnTo ? `?next=${encodeURIComponent(returnTo)}` : ""}`);
  return user;
}

/** For route handlers: throw 401 when there is no session. */
export async function requireApiUser(h: Headers): Promise<SessionUser> {
  const user = await getUserFromHeaders(h);
  if (!user) throw errors.unauthenticated();
  return user;
}
