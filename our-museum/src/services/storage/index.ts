import "server-only";
import { prisma, type Tx } from "@/lib/database/prisma";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { LocalStorageDriver } from "./local-driver";
import { S3StorageDriver } from "./s3-driver";
import type { StorageDriver } from "./types";

export type { StorageDriver, UploadTarget } from "./types";

const g = globalThis as unknown as { __ourMuseumStorage?: StorageDriver };

/** The configured StorageService driver (STORAGE_DRIVER=local|s3). */
export function storage(): StorageDriver {
  if (g.__ourMuseumStorage) return g.__ourMuseumStorage;
  const e = env();
  const driver: StorageDriver =
    e.STORAGE_DRIVER === "s3"
      ? new S3StorageDriver({
          endpoint: e.S3_ENDPOINT,
          publicEndpoint: e.S3_PUBLIC_ENDPOINT,
          region: e.S3_REGION,
          bucket: e.S3_BUCKET!,
          accessKeyId: e.S3_ACCESS_KEY_ID!,
          secretAccessKey: e.S3_SECRET_ACCESS_KEY!,
          forcePathStyle: e.S3_FORCE_PATH_STYLE,
        })
      : new LocalStorageDriver(e.STORAGE_LOCAL_DIR);
  g.__ourMuseumStorage = driver;
  return driver;
}

/** Signed-URL lifetime for photo reads. */
export const SIGNED_URL_TTL_SECONDS = 15 * 60;

/**
 * Queues objects for deletion. Deletions are recorded in the database first so
 * they survive crashes, then attempted immediately; failures are retried by
 * the cleanup job (/api/cron/cleanup).
 */
export async function queueStorageDeletion(keys: string[], reason: string, db: Tx | typeof prisma = prisma) {
  const unique = [...new Set(keys.filter(Boolean))];
  if (!unique.length) return;
  await db.storageDeletion.createMany({ data: unique.map((key) => ({ key, reason })) });
}

/** Processes due deletions. Safe to call concurrently-ish; each row is claimed by id. */
export async function processDeletionQueue(limit = 200): Promise<{ deleted: number; failed: number }> {
  const due = await prisma.storageDeletion.findMany({
    where: { nextAttemptAt: { lte: new Date() } },
    orderBy: { nextAttemptAt: "asc" },
    take: limit,
  });
  let deleted = 0;
  let failed = 0;
  for (const row of due) {
    try {
      await storage().delete(row.key);
      await prisma.storageDeletion.delete({ where: { id: row.id } }).catch(() => undefined);
      deleted++;
    } catch (error) {
      failed++;
      const attempts = row.attempts + 1;
      await prisma.storageDeletion.update({
        where: { id: row.id },
        data: {
          attempts,
          lastError: error instanceof Error ? error.message.slice(0, 300) : "unknown",
          nextAttemptAt: new Date(Date.now() + Math.min(24 * 3600, 60 * 2 ** attempts) * 1000),
        },
      });
      logger.warn("storage_delete_failed", { key: row.key, attempts });
    }
  }
  return { deleted, failed };
}

/** Best-effort immediate processing after a user-facing deletion. */
export function kickDeletionQueue() {
  processDeletionQueue(50).catch((error) => logger.warn("storage_queue_kick_failed", { error }));
}

export function photoKeys(museumId: string, photoId: string, ext: string) {
  const base = `museums/${museumId}/photos/${photoId}`;
  return {
    storageKey: `${base}/original.${ext}`,
    largeKey: `${base}/large.webp`,
    mediumKey: `${base}/medium.webp`,
    thumbnailKey: `${base}/thumb.webp`,
  };
}

export function incomingKey(museumId: string, uploadId: string) {
  return `incoming/${museumId}/${uploadId}`;
}
