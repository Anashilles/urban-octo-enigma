import "server-only";
import { z } from "zod";

/**
 * Server-side environment, validated once on first access.
 * Every variable is documented in `.env.example` and docs/DEPLOYMENT.md.
 */
const bool = z
  .enum(["true", "false", "1", "0", ""])
  .optional()
  .transform((v) => v === "true" || v === "1");

const csv = z
  .string()
  .optional()
  .transform((v) =>
    (v ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  AUTH_REQUIRE_EMAIL_VERIFICATION: bool,
  ADMIN_EMAILS: csv,

  EMAIL_DRIVER: z.enum(["console", "smtp"]).default("console"),
  EMAIL_FROM: z.string().default("Our Museum <no-reply@localhost>"),
  SMTP_URL: z.string().optional(),
  ENABLE_DEV_OUTBOX: bool,

  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("./.data/storage"),
  STORAGE_SIGNING_SECRET: z.string().min(32).optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_PUBLIC_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default("auto"),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: bool,
  UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(15 * 1024 * 1024),

  // Read at request time on the server (ticket responses, CSP) — never baked into the build.
  REALTIME_PUBLIC_URL: z.string().default("ws://localhost:4001"),
  REALTIME_INTERNAL_URL: z.string().default("http://localhost:4001"),
  REALTIME_TICKET_SECRET: z.string().min(32).optional(),

  STUN_URLS: csv,
  TURN_URLS: csv,
  TURN_SHARED_SECRET: z.string().optional(),
  // Send all voice through TURN so visitors never learn each other's IP addresses.
  VOICE_RELAY_ONLY: bool,

  CRON_SECRET: z.string().min(16).optional(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | null = null;

/**
 * `next build` imports server modules to collect route information. Every
 * route is rendered on demand, so the build needs no real secrets: missing
 * required values get inert placeholders there (and only there), which keeps
 * secrets out of build environments and container images.
 */
const BUILD_PLACEHOLDERS = {
  DATABASE_URL: "postgresql://build-placeholder:5432/unused",
  BETTER_AUTH_SECRET: "build-placeholder-never-used-at-runtime-0000",
};

export function env(): ServerEnv {
  if (cached) return cached;
  const building = process.env.NEXT_PHASE === "phase-production-build";
  // Empty values count as unset (`FOO=` in .env files, `${FOO:-}` in docker compose).
  const set = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v));
  const parsed = serverEnvSchema.safeParse(building ? { ...BUILD_PLACEHOLDERS, ...set } : set);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid server environment configuration:\n${issues}`);
  }
  const value = parsed.data;
  if (value.STORAGE_DRIVER === "s3") {
    for (const key of ["S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const) {
      if (!value[key]) throw new Error(`${key} is required when STORAGE_DRIVER=s3`);
    }
  }
  if (value.NODE_ENV === "production" && value.ENABLE_DEV_OUTBOX) {
    throw new Error("ENABLE_DEV_OUTBOX must not be enabled in production");
  }
  cached = value;
  return value;
}

/** Secret used to sign local-storage URLs. Falls back to a derivation of the auth secret. */
export function storageSigningSecret(): string {
  const e = env();
  return e.STORAGE_SIGNING_SECRET ?? `storage:${e.BETTER_AUTH_SECRET}`;
}

/** Secret shared with the realtime service to sign connection tickets. */
export function realtimeTicketSecret(): string {
  const e = env();
  return e.REALTIME_TICKET_SECRET ?? `realtime:${e.BETTER_AUTH_SECRET}`;
}
