import "server-only";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/database/prisma";
import { errors } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { detectAudioFormat, MAX_NARRATION_BYTES, MAX_NARRATION_MS, NARRATION_FORMATS } from "@/lib/validation/narration";
import { requireMuseumAccess } from "./access";
import { notifyMuseumChanged } from "./realtime-notify";
import { kickDeletionQueue, queueStorageDeletion, SIGNED_URL_TTL_SECONDS, storage } from "./storage";

/**
 * Voice narration for a photograph within a tour, recorded in the browser.
 * The file is checked by its content (WebM, Ogg or MP4 audio), size-limited,
 * stored privately and served through short-lived signed URLs.
 */
export async function saveNarration(userId: string, museumId: string, tourId: string, frameId: string, bytes: Uint8Array, durationMs: number) {
  await requireMuseumAccess(userId, museumId, "tour.manage");
  if (bytes.length > MAX_NARRATION_BYTES) throw errors.tooLarge(`Narrations can be at most ${MAX_NARRATION_BYTES / 1024 / 1024} MB.`);
  if (bytes.length === 0) throw errors.validation("The recording is empty.");
  if (!Number.isFinite(durationMs) || durationMs < 500 || durationMs > MAX_NARRATION_MS) throw errors.validation("Narrations can be at most 3 minutes long.");
  const format = detectAudioFormat(bytes);
  if (!format) throw errors.unsupported("This is not a supported audio recording.");
  const stop = await prisma.tourStop.findFirst({ where: { tourId, frameId, tour: { museumId } }, select: { id: true } });
  if (!stop) throw errors.notFound("That photograph is not a stop on this tour.");

  const { mimeType, ext } = NARRATION_FORMATS[format];
  const key = `museums/${museumId}/narrations/${tourId}/${randomBytes(12).toString("hex")}.${ext}`;
  await storage().put(key, Buffer.from(bytes), mimeType);
  let previous: { storageKey: string } | null;
  try {
    previous = await prisma.$transaction(async (tx) => {
      // Lock the stop: concurrent saves for it queue up (so each replaced file is
      // seen and deleted), and a tour re-saved meanwhile can't leave this orphaned.
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT s.id FROM "tour_stops" s JOIN "guided_tours" t ON t.id = s."tourId"
        WHERE s."tourId" = ${tourId} AND s."frameId" = ${frameId} AND t."museumId" = ${museumId} FOR UPDATE OF s`;
      if (!locked.length) throw errors.notFound("That photograph is not a stop on this tour.");
      const old = await tx.tourNarration.findUnique({ where: { tourId_frameId: { tourId, frameId } }, select: { storageKey: true } });
      await tx.tourNarration.upsert({
        where: { tourId_frameId: { tourId, frameId } },
        create: { museumId, tourId, frameId, storageKey: key, mimeType, durationMs: Math.round(durationMs), sizeBytes: bytes.length, createdById: userId },
        update: { storageKey: key, mimeType, durationMs: Math.round(durationMs), sizeBytes: bytes.length, createdById: userId, createdAt: new Date() },
      });
      if (old) await queueStorageDeletion([old.storageKey], "narration-replaced", tx);
      return old;
    });
  } catch (error) {
    // Nothing refers to the new file; don't leave it behind.
    await storage()
      .delete(key)
      .catch(() => queueStorageDeletion([key], "narration-failed"));
    throw error;
  }
  if (previous) kickDeletionQueue();
  notifyMuseumChanged(museumId, "tours", userId);
  return { durationMs: Math.round(durationMs), url: await storage().signedGetUrl(key, { expiresInSeconds: SIGNED_URL_TTL_SECONDS }) };
}

export async function deleteNarration(userId: string, museumId: string, tourId: string, frameId: string) {
  await requireMuseumAccess(userId, museumId, "tour.manage");
  const row = await prisma.tourNarration.findFirst({ where: { tourId, frameId, museumId }, select: { id: true, storageKey: true } });
  if (!row) throw errors.notFound("No narration to delete.");
  await prisma.$transaction(async (tx) => {
    await queueStorageDeletion([row.storageKey], "narration-deleted", tx);
    await tx.tourNarration.delete({ where: { id: row.id } });
  });
  kickDeletionQueue();
  notifyMuseumChanged(museumId, "tours", userId);
}

/**
 * Removes narrations nobody can hear any more — their tour or frame was
 * deleted, or the tour no longer stops at that photograph — and queues their
 * files for deletion. Runs after tour and frame changes and from the cron.
 */
export async function cleanupOrphanNarrations(museumId?: string) {
  const rows = await prisma.tourNarration.findMany({
    where: museumId ? { museumId } : {},
    select: { id: true, tourId: true, frameId: true, storageKey: true },
  });
  if (!rows.length) return 0;
  const tourIds = [...new Set(rows.map((r) => r.tourId).filter((id): id is string => Boolean(id)))];
  const stops = await prisma.tourStop.findMany({ where: { tourId: { in: tourIds } }, select: { tourId: true, frameId: true } });
  const used = new Set(stops.map((s) => `${s.tourId}:${s.frameId}`));
  const orphans = rows.filter((r) => !r.tourId || !r.frameId || !used.has(`${r.tourId}:${r.frameId}`));
  if (!orphans.length) return 0;
  await prisma.$transaction(async (tx) => {
    await queueStorageDeletion(orphans.map((o) => o.storageKey), "narration-orphaned", tx);
    await tx.tourNarration.deleteMany({ where: { id: { in: orphans.map((o) => o.id) } } });
  });
  kickDeletionQueue();
  return orphans.length;
}

/**
 * Tidy-up after a change that can orphan narrations (tours, frames, photos,
 * rooms). It never fails the change itself; the cron catches anything missed.
 */
export async function tidyNarrations(museumId: string) {
  await cleanupOrphanNarrations(museumId).catch((error) => logger.warn("narration_cleanup_failed", { museumId, error: String(error) }));
}

/** Signed narration URLs for a museum's tours, keyed "tourId:frameId". */
export async function narrationsForScene(museumId: string) {
  const rows = await prisma.tourNarration.findMany({ where: { museumId, tourId: { not: null }, frameId: { not: null } } });
  const s = storage();
  const entries = await Promise.all(
    rows.map(async (r) => [
        `${r.tourId}:${r.frameId}`,
        { url: await s.signedGetUrl(r.storageKey, { expiresInSeconds: SIGNED_URL_TTL_SECONDS }), durationMs: r.durationMs, recordedAt: r.createdAt.toISOString() },
      ] as const),
  );
  return new Map(entries);
}
