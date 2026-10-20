import "server-only";
import { prisma } from "@/lib/database/prisma";
import { env } from "@/lib/env";
import { AppError, errors, isAppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { can } from "@/lib/permissions";
import type { z } from "zod";
import type { completeUploadSchema, createUploadSchema, updatePhotoSchema } from "@/lib/validation/photos";
import { requireMuseumAccess } from "./access";
import { recordEvent } from "./audit-service";
import { ACCEPTED_MIME_TYPES } from "./image-processing-types";
import { processImage } from "./image-processing";
import { notifyMuseumChanged } from "./realtime-notify";
import { bumpLayoutVersion } from "./room-service";
import { incomingKey, kickDeletionQueue, photoKeys, queueStorageDeletion, storage } from "./storage";

const UPLOAD_SLOT_TTL_MS = 60 * 60 * 1000;
export const MAX_PHOTOS_PER_MUSEUM = 1500;

function newId() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 24);
}

/**
 * Step 1: reserve an upload slot and get a short-lived, single-object upload
 * URL. The declared type and size are checked here and again after upload.
 */
export async function createUpload(userId: string, museumId: string, input: z.infer<typeof createUploadSchema>) {
  await requireMuseumAccess(userId, museumId, "photo.upload");
  const max = env().UPLOAD_MAX_BYTES;
  if (input.size > max) throw errors.tooLarge(`Photos can be at most ${Math.round(max / 1024 / 1024)} MB.`);
  // Browsers sometimes send an empty type for HEIC; then the extension must look like an image.
  // Either way the real content is verified from its bytes when the upload completes.
  const declared = input.mimeType.toLowerCase();
  const mimeOk = (ACCEPTED_MIME_TYPES as readonly string[]).includes(declared);
  const extOk = /\.(jpe?g|png|webp|heic|heif)$/i.test(input.filename);
  if (!mimeOk && !((declared === "" || declared === "application/octet-stream") && extOk)) {
    throw errors.unsupported("This file type isn't supported. Use JPEG, PNG, WebP or HEIC.");
  }
  const count = await prisma.photo.count({ where: { museumId } });
  if (count >= MAX_PHOTOS_PER_MUSEUM) throw errors.conflict("This museum has reached its photo limit.");

  const id = newId();
  const key = incomingKey(museumId, id);
  const contentType = mimeOk ? declared : "application/octet-stream";
  await prisma.pendingUpload.create({
    data: {
      id,
      museumId,
      userId,
      incomingKey: key,
      originalFilename: input.filename.slice(0, 255),
      declaredMimeType: contentType,
      declaredSize: input.size,
      expiresAt: new Date(Date.now() + UPLOAD_SLOT_TTL_MS),
    },
  });
  const target = await storage().createUploadTarget(key, { contentType, maxBytes: max, expiresInSeconds: 15 * 60 });
  return { uploadId: id, target, maxBytes: max };
}

async function failUpload(uploadId: string, museumId: string, userId: string, error: unknown, extraKeys: string[] = []) {
  const message = isAppError(error) ? error.message : "Processing failed";
  const upload = await prisma.pendingUpload.update({
    where: { id: uploadId },
    data: { status: "FAILED", error: message.slice(0, 300) },
  });
  await queueStorageDeletion([upload.incomingKey, ...extraKeys], "upload-failed");
  await recordEvent({ museumId, actorId: userId, eventType: "upload.failed", entityId: uploadId, metadata: { reason: isAppError(error) ? error.code : "INTERNAL" } });
  kickDeletionQueue();
}

/**
 * Step 2: verify the uploaded object, decode and re-encode it, store the
 * derivatives and create the Photo. Any failure leaves no orphaned files.
 */
export async function completeUpload(userId: string, uploadId: string, meta: z.infer<typeof completeUploadSchema>) {
  const upload = await prisma.pendingUpload.findUnique({ where: { id: uploadId } });
  if (!upload || upload.userId !== userId) throw errors.notFound("Upload not found");
  await requireMuseumAccess(userId, upload.museumId, "photo.upload");
  if (upload.status === "COMPLETED" && upload.photoId) return { photoId: upload.photoId };
  if (upload.status !== "PENDING") throw errors.conflict("This upload can no longer be completed. Please upload the photo again.");
  if (upload.expiresAt < new Date()) throw errors.gone("This upload expired. Please try again.");
  const claimed = await prisma.pendingUpload.updateMany({ where: { id: uploadId, status: "PENDING" }, data: { status: "PROCESSING" } });
  if (claimed.count === 0) throw errors.conflict("This upload is already being processed.");

  const photoId = newId();
  let written: string[] = [];
  try {
    const head = await storage().head(upload.incomingKey);
    if (!head) throw errors.badRequest("The file never arrived. Please try again.");
    if (head.size > env().UPLOAD_MAX_BYTES) throw errors.tooLarge("This photo is larger than the upload limit.");
    if (head.size === 0) throw errors.badRequest("The uploaded file is empty.");
    const bytes = await storage().get(upload.incomingKey);
    const processed = await processImage(bytes);
    const keys = photoKeys(upload.museumId, photoId, processed.original.ext);
    written = [keys.storageKey, keys.largeKey, keys.mediumKey, keys.thumbnailKey];
    await Promise.all([
      storage().put(keys.storageKey, processed.original.buffer, processed.original.contentType),
      storage().put(keys.largeKey, processed.large.buffer, processed.large.contentType),
      storage().put(keys.mediumKey, processed.medium.buffer, processed.medium.contentType),
      storage().put(keys.thumbnailKey, processed.thumb.buffer, processed.thumb.contentType),
    ]);
    const title = meta.title ?? upload.originalFilename.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").trim().slice(0, 120);
    await prisma.$transaction(async (tx) => {
      await tx.photo.create({
        data: {
          id: photoId,
          museumId: upload.museumId,
          uploadedById: userId,
          ...keys,
          originalFilename: upload.originalFilename,
          mimeType: processed.original.contentType,
          width: processed.width,
          height: processed.height,
          sizeBytes: processed.original.buffer.length,
          dominantColor: processed.dominantColor,
          title,
          caption: meta.caption ?? "",
          takenAt: meta.takenAt ? new Date(`${meta.takenAt}T12:00:00Z`) : null,
        },
      });
      if (meta.collectionId) {
        const col = await tx.photoCollection.findFirst({ where: { id: meta.collectionId, museumId: upload.museumId } });
        if (col) {
          const last = await tx.collectionPhoto.aggregate({ where: { collectionId: col.id }, _max: { sortOrder: true } });
          await tx.collectionPhoto.create({ data: { collectionId: col.id, photoId, sortOrder: (last._max.sortOrder ?? -1) + 1 } });
        }
      }
      await tx.pendingUpload.update({ where: { id: uploadId }, data: { status: "COMPLETED", photoId } });
      await recordEvent(
        { museumId: upload.museumId, actorId: userId, eventType: "photo.uploaded", entityId: photoId, metadata: { format: processed.sourceFormat, bytes: bytes.length } },
        tx,
      );
    });
    await storage().delete(upload.incomingKey).catch(() => queueStorageDeletion([upload.incomingKey], "incoming-cleanup"));
    notifyMuseumChanged(upload.museumId, "photos", userId);
    return { photoId };
  } catch (error) {
    await failUpload(uploadId, upload.museumId, userId, error, written);
    if (isAppError(error)) throw error;
    logger.error("upload_processing_failed", { uploadId, error });
    throw new AppError("INTERNAL", "We couldn't process this photo. Please try again.");
  }
}

export async function cancelUpload(userId: string, uploadId: string) {
  const upload = await prisma.pendingUpload.findUnique({ where: { id: uploadId } });
  if (!upload || upload.userId !== userId) throw errors.notFound("Upload not found");
  if (upload.status === "COMPLETED") return;
  await prisma.pendingUpload.update({ where: { id: uploadId }, data: { status: "FAILED", error: "cancelled" } });
  await queueStorageDeletion([upload.incomingKey], "upload-cancelled");
  kickDeletionQueue();
}

export async function updatePhoto(userId: string, museumId: string, photoId: string, patch: z.infer<typeof updatePhotoSchema>) {
  await requireMuseumAccess(userId, museumId, "photo.edit");
  const photo = await prisma.photo.findFirst({ where: { id: photoId, museumId } });
  if (!photo) throw errors.notFound("Photo not found");
  await prisma.$transaction(async (tx) => {
    await tx.photo.update({
      where: { id: photoId },
      data: {
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.caption !== undefined ? { caption: patch.caption } : {}),
        ...(patch.takenAt !== undefined ? { takenAt: patch.takenAt ? new Date(`${patch.takenAt}T12:00:00Z`) : null } : {}),
      },
    });
    if (patch.collectionIds) {
      const valid = await tx.photoCollection.findMany({ where: { museumId, id: { in: patch.collectionIds } }, select: { id: true } });
      const wanted = new Set(valid.map((c) => c.id));
      const current = await tx.collectionPhoto.findMany({ where: { photoId } });
      for (const c of current) if (!wanted.has(c.collectionId)) await tx.collectionPhoto.delete({ where: { collectionId_photoId: { collectionId: c.collectionId, photoId } } });
      for (const cid of wanted) {
        if (current.some((c) => c.collectionId === cid)) continue;
        const last = await tx.collectionPhoto.aggregate({ where: { collectionId: cid }, _max: { sortOrder: true } });
        await tx.collectionPhoto.create({ data: { collectionId: cid, photoId, sortOrder: (last._max.sortOrder ?? -1) + 1 } });
      }
    }
    await recordEvent({ museumId, actorId: userId, eventType: "photo.updated", entityId: photoId }, tx);
  });
  notifyMuseumChanged(museumId, "photos", userId);
}

/**
 * Deletes a photo, every frame showing it, and (via the deletion queue) all of
 * its stored files. Owners can delete any photo; editors only their own.
 */
export async function deletePhoto(userId: string, museumId: string, photoId: string) {
  const access = await requireMuseumAccess(userId, museumId, "museum.view");
  const photo = await prisma.photo.findFirst({ where: { id: photoId, museumId } });
  if (!photo) throw errors.notFound("Photo not found");
  const allowed = can(access.role, "photo.deleteAny") || (can(access.role, "photo.deleteOwn") && photo.uploadedById === userId);
  if (!allowed) throw errors.forbidden("You can't delete this photo.");
  await prisma.$transaction(async (tx) => {
    await queueStorageDeletion([photo.storageKey, photo.largeKey, photo.mediumKey, photo.thumbnailKey], `photo:${photoId}`, tx);
    const frames = await tx.photoFrame.count({ where: { photoId } });
    await tx.photo.delete({ where: { id: photoId } });
    if (frames) await bumpLayoutVersion(tx, museumId);
    await recordEvent({ museumId, actorId: userId, eventType: "photo.deleted", entityId: photoId, metadata: { frames } }, tx);
  });
  kickDeletionQueue();
  notifyMuseumChanged(museumId, "photos", userId);
}

export async function setFavorite(userId: string, museumId: string, photoId: string, favorite: boolean) {
  await requireMuseumAccess(userId, museumId, "museum.view");
  const photo = await prisma.photo.findFirst({ where: { id: photoId, museumId }, select: { id: true } });
  if (!photo) throw errors.notFound("Photo not found");
  if (favorite) {
    await prisma.photoFavorite.upsert({ where: { userId_photoId: { userId, photoId } }, create: { userId, photoId }, update: {} });
  } else {
    await prisma.photoFavorite.deleteMany({ where: { userId, photoId } });
  }
}

/** Removes abandoned upload slots and their incoming objects (cron). */
export async function cleanupAbandonedUploads() {
  const stale = await prisma.pendingUpload.findMany({
    where: { OR: [{ status: { in: ["PENDING", "PROCESSING"] }, expiresAt: { lt: new Date() } }, { status: "FAILED", createdAt: { lt: new Date(Date.now() - 24 * 3600 * 1000) } }] },
    take: 500,
  });
  if (!stale.length) return 0;
  await queueStorageDeletion(stale.filter((u) => u.status !== "FAILED").map((u) => u.incomingKey), "upload-abandoned");
  await prisma.pendingUpload.deleteMany({ where: { id: { in: stale.map((u) => u.id) } } });
  return stale.length;
}
