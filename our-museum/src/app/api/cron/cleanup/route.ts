import { timingSafeEqual } from "node:crypto";
import { apiHandler, json } from "@/lib/api/handler";
import { env } from "@/lib/env";
import { errors } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { cleanupOrphanNarrations } from "@/services/narration-service";
import { cleanupAbandonedUploads } from "@/services/photo-service";
import { processDeletionQueue } from "@/services/storage";

function authorised(req: Request) {
  const secret = env().CRON_SECRET;
  const header = req.headers.get("authorization") ?? "";
  if (!secret) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Periodic maintenance (Vercel Cron or any scheduler): removes abandoned
 * uploads and orphaned narrations, and retries queued storage deletions. Requires CRON_SECRET.
 */
async function run(req: Request) {
  if (!authorised(req)) throw errors.unauthenticated("Invalid cron secret");
  const abandoned = await cleanupAbandonedUploads();
  const narrations = await cleanupOrphanNarrations();
  const deletions = await processDeletionQueue(500);
  logger.info("cron_cleanup", { abandoned, narrations, ...deletions });
  return json({ abandoned, narrations, ...deletions });
}

export const GET = apiHandler(async (req) => run(req), { skipCsrf: true });
export const POST = apiHandler(async (req) => run(req), { skipCsrf: true });
