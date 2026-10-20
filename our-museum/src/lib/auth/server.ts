import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { anonymous } from "better-auth/plugins";
import { prisma } from "@/lib/database/prisma";
import { env } from "@/lib/env";
import { sendEmail } from "@/lib/email";
import { resetPasswordEmail, verificationEmail } from "@/lib/email/templates";
import { logger } from "@/lib/logger";

const e = env();
const isProd = e.NODE_ENV === "production";
const rateLimitEnabled = process.env.AUTH_RATE_LIMIT !== "off";

export const auth = betterAuth({
  appName: "Our Museum",
  baseURL: e.APP_URL,
  secret: e.BETTER_AUTH_SECRET,
  trustedOrigins: [e.APP_URL],
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  telemetry: { enabled: false },
  user: {
    fields: { name: "displayName" },
    additionalFields: {
      locale: { type: "string", required: false, defaultValue: "en", input: true },
    },
    deleteUser: {
      enabled: true,
      // Museums the user owns are deleted (and their photos queued for storage
      // deletion) before the user row is removed. Memberships cascade.
      beforeDelete: async (user) => {
        const { deleteAllMuseumsOwnedBy } = await import("@/services/museum-service");
        await deleteAllMuseumsOwnedBy(user.id);
        logger.info("account_deleted", { userId: user.id });
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    requireEmailVerification: e.AUTH_REQUIRE_EMAIL_VERIFICATION,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await sendEmail(resetPasswordEmail(user as typeof user & { locale?: string }, url));
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: e.AUTH_REQUIRE_EMAIL_VERIFICATION,
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60 * 24,
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail(verificationEmail(user as typeof user & { locale?: string }, url));
    },
  },
  rateLimit: {
    enabled: rateLimitEnabled,
    storage: "database",
    window: 60,
    max: 120,
    customRules: {
      "/sign-in/email": { window: 60, max: 10 },
      "/sign-up/email": { window: 60, max: 10 },
      "/sign-in/anonymous": { window: 60, max: 10 },
      "/request-password-reset": { window: 300, max: 5 },
      "/send-verification-email": { window: 300, max: 5 },
    },
  },
  advanced: {
    cookiePrefix: "om",
    useSecureCookies: isProd,
    defaultCookieAttributes: { httpOnly: true, sameSite: "lax", secure: isProd },
  },
  plugins: [
    anonymous({
      emailDomainName: "guest.our-museum.invalid",
      generateName: () => "Guest",
      // When a guest later creates a full account, carry their memberships and
      // avatar over to it before the anonymous user is deleted.
      onLinkAccount: async ({ anonymousUser, newUser }) => {
        const { linkAnonymousAccount } = await import("@/services/membership-service");
        await linkAnonymousAccount(anonymousUser.user.id, newUser.user.id);
      },
    }),
    nextCookies(),
  ],
});

export type AuthSession = typeof auth.$Infer.Session;
