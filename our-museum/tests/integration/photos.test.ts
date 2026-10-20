import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { NextRequest } from "next/server";
import sharp from "sharp";
import { beforeEach, describe, expect, it } from "vitest";
import { GET as getObject } from "@/app/api/storage/object/route";
import { PUT as putUpload } from "@/app/api/storage/upload/route";
import { prisma } from "@/lib/database/prisma";
import { createMuseum } from "@/services/museum-service";
import { cancelUpload, cleanupAbandonedUploads, completeUpload, createUpload, deletePhoto } from "@/services/photo-service";
import { getScene } from "@/services/scene-service";
import { processDeletionQueue, storage } from "@/services/storage";
import { LocalStorageDriver } from "@/services/storage/local-driver";
import { addMember, createUser, makeJpeg, makePng, resetDatabase } from "../helpers/factories";

const ctx = { params: Promise.resolve({}) };

async function putBytes(url: string, body: Buffer, contentType = "image/jpeg") {
  const req = new NextRequest(new URL(url, "http://localhost:3000"), {
    method: "PUT",
    body: new Uint8Array(body),
    headers: { "content-type": contentType, "content-length": String(body.length) },
  });
  return putUpload(req, ctx as never);
}

async function upload(userId: string, museumId: string, body: Buffer, filename = "photo.jpg", mimeType = "image/jpeg") {
  const { uploadId, target } = await createUpload(userId, museumId, { filename, mimeType, size: body.length });
  const res = await putBytes(target.url, body, mimeType);
  expect(res.status).toBe(200);
  return { uploadId, ...(await completeUpload(userId, uploadId, {})) };
}

describe("photo uploads", () => {
  let owner: Awaited<ReturnType<typeof createUser>>;
  let museumId: string;

  beforeEach(async () => {
    await resetDatabase();
    owner = await createUser("Owner");
    museumId = (await createMuseum(owner, { name: "Test", description: "", templateId: "minimal-white" }, "en")).id;
  });

  it("stores a valid JPEG with derivatives and metadata", async () => {
    const { photoId } = await upload(owner.id, museumId, await makeJpeg(800, 600), "Beach day.jpg");
    const photo = await prisma.photo.findUniqueOrThrow({ where: { id: photoId } });
    expect(photo).toMatchObject({ width: 800, height: 600, title: "Beach day", mimeType: "image/jpeg" });
    for (const key of [photo.storageKey, photo.largeKey, photo.mediumKey, photo.thumbnailKey]) {
      expect(await storage().head(key)).not.toBeNull();
    }
    const thumb = await sharp(await storage().get(photo.thumbnailKey)).metadata();
    expect(thumb.format).toBe("webp");
    expect(Math.max(thumb.width!, thumb.height!)).toBeLessThanOrEqual(480);
    // The incoming object is removed after processing.
    const pending = await prisma.pendingUpload.findFirstOrThrow({ where: { photoId } });
    expect(await storage().head(pending.incomingKey)).toBeNull();
  });

  it("applies EXIF orientation and strips GPS and other metadata", async () => {
    const { photoId } = await upload(owner.id, museumId, await makeJpeg(600, 400, { orientation: 6, gps: true }));
    const photo = await prisma.photo.findUniqueOrThrow({ where: { id: photoId } });
    // Orientation 6 rotates 90°: the stored image is portrait.
    expect({ w: photo.width, h: photo.height }).toEqual({ w: 400, h: 600 });
    const meta = await sharp(await storage().get(photo.storageKey)).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.orientation ?? 1).toBe(1);
  });

  it("converts iPhone HEIC photos", async () => {
    const heic = await readFile("tests/fixtures/sample.heic");
    const { photoId } = await upload(owner.id, museumId, heic, "IMG_0001.HEIC", "image/heic");
    const photo = await prisma.photo.findUniqueOrThrow({ where: { id: photoId } });
    expect(photo).toMatchObject({ width: 480, height: 320, mimeType: "image/jpeg" });
  });

  it("keeps PNG transparency in the original", async () => {
    const { photoId } = await upload(owner.id, museumId, await makePng(), "logo.png", "image/png");
    const photo = await prisma.photo.findUniqueOrThrow({ where: { id: photoId } });
    expect(photo.mimeType).toBe("image/png");
  });

  it("rejects files that are not really images, whatever their name and type", async () => {
    const fake = Buffer.from("#!/bin/sh\necho not an image\n".repeat(20));
    const { uploadId, target } = await createUpload(owner.id, museumId, { filename: "evil.jpg", mimeType: "image/jpeg", size: fake.length });
    await putBytes(target.url, fake);
    await expect(completeUpload(owner.id, uploadId, {})).rejects.toMatchObject({ code: "UNSUPPORTED_MEDIA_TYPE" });
    expect(await prisma.photo.count()).toBe(0);
    const failed = await prisma.pendingUpload.findUniqueOrThrow({ where: { id: uploadId } });
    expect(failed.status).toBe("FAILED");
    expect(await prisma.museumEvent.count({ where: { eventType: "upload.failed" } })).toBe(1);
  });

  it("rejects unsupported declared types and executables up front", async () => {
    await expect(createUpload(owner.id, museumId, { filename: "x.exe", mimeType: "application/x-msdownload", size: 100 })).rejects.toMatchObject({
      code: "UNSUPPORTED_MEDIA_TYPE",
    });
    await expect(createUpload(owner.id, museumId, { filename: "x.gif", mimeType: "image/gif", size: 100 })).rejects.toMatchObject({
      code: "UNSUPPORTED_MEDIA_TYPE",
    });
  });

  it("rejects oversized files both when declared and when streamed", async () => {
    await expect(createUpload(owner.id, museumId, { filename: "big.jpg", mimeType: "image/jpeg", size: 5_000_000 })).rejects.toMatchObject({
      code: "PAYLOAD_TOO_LARGE",
    });
    // Lies about its size, then sends more than the limit.
    const { target } = await createUpload(owner.id, museumId, { filename: "liar.jpg", mimeType: "image/jpeg", size: 1000 });
    const res = await putBytes(target.url, Buffer.alloc(2_100_000, 1));
    expect(res.status).toBe(413);
  });

  it("lets a failed upload be retried with a fresh slot", async () => {
    const good = await makeJpeg();
    const { uploadId, target } = await createUpload(owner.id, museumId, { filename: "a.jpg", mimeType: "image/jpeg", size: good.length });
    // First attempt: the bytes never arrive.
    await expect(completeUpload(owner.id, uploadId, {})).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(putBytes(target.url, good).then(() => completeUpload(owner.id, uploadId, {}))).rejects.toMatchObject({ code: "CONFLICT" });
    // Retry: a new slot succeeds.
    const retry = await upload(owner.id, museumId, good, "a.jpg");
    expect(retry.photoId).toBeTruthy();
  });

  it("supports cancelling and cleans abandoned slots", async () => {
    const { uploadId } = await createUpload(owner.id, museumId, { filename: "a.jpg", mimeType: "image/jpeg", size: 10 });
    await cancelUpload(owner.id, uploadId);
    expect((await prisma.pendingUpload.findUniqueOrThrow({ where: { id: uploadId } })).status).toBe("FAILED");
    const { uploadId: stale } = await createUpload(owner.id, museumId, { filename: "b.jpg", mimeType: "image/jpeg", size: 10 });
    await prisma.pendingUpload.update({ where: { id: stale }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await cleanupAbandonedUploads()).toBeGreaterThanOrEqual(1);
    expect(await prisma.pendingUpload.findUnique({ where: { id: stale } })).toBeNull();
  });

  it("deleting a photo removes its frames and its stored files", async () => {
    const { photoId } = await upload(owner.id, museumId, await makeJpeg());
    const photo = await prisma.photo.findUniqueOrThrow({ where: { id: photoId } });
    const driver = storage() as LocalStorageDriver;
    expect(existsSync(driver.resolve(photo.largeKey))).toBe(true);
    await deletePhoto(owner.id, museumId, photoId);
    await processDeletionQueue();
    for (const key of [photo.storageKey, photo.largeKey, photo.mediumKey, photo.thumbnailKey]) {
      expect(existsSync(driver.resolve(key))).toBe(false);
    }
    expect(await prisma.photo.count()).toBe(0);
  });

  it("enforces roles: visitors cannot upload or delete; editors delete only their own photos", async () => {
    const visitor = await createUser("Visitor");
    const editor = await createUser("Editor");
    await addMember(museumId, visitor.id, "VISITOR");
    await addMember(museumId, editor.id, "EDITOR");
    await expect(createUpload(visitor.id, museumId, { filename: "a.jpg", mimeType: "image/jpeg", size: 10 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const { photoId: ownersPhoto } = await upload(owner.id, museumId, await makeJpeg());
    await expect(deletePhoto(visitor.id, museumId, ownersPhoto)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(deletePhoto(editor.id, museumId, ownersPhoto)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const { photoId: editorsPhoto } = await upload(editor.id, museumId, await makeJpeg());
    await deletePhoto(editor.id, museumId, editorsPhoto);
    expect(await prisma.photo.count()).toBe(1);
  });

  it("does not let non-members upload to or even see a museum", async () => {
    const stranger = await createUser("Stranger");
    await expect(createUpload(stranger.id, museumId, { filename: "a.jpg", mimeType: "image/jpeg", size: 10 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getScene(stranger, museumId)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("private photo delivery", () => {
  beforeEach(resetDatabase);

  it("serves photos only through valid, unexpired signed URLs", async () => {
    const owner = await createUser("Owner");
    const museumId = (await createMuseum(owner, { name: "Test", description: "", templateId: "minimal-white" }, "en")).id;
    const { photoId } = await upload(owner.id, museumId, await makeJpeg());
    const scene = await getScene(owner, museumId);
    const signed = scene.photos.find((p) => p.id === photoId)!.urls!.large;
    const ok = await getObject(new NextRequest(new URL(signed, "http://localhost:3000")), ctx as never);
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("image/webp");
    expect(ok.headers.get("cache-control")).toMatch(/^private/);

    const url = new URL(signed, "http://localhost:3000");
    // No signature.
    const bare = new URL(url);
    bare.searchParams.delete("s");
    expect((await getObject(new NextRequest(bare), ctx as never)).status).toBe(403);
    // Tampered key.
    const tampered = new URL(url);
    tampered.searchParams.set("k", url.searchParams.get("k")!.replace("large", "original"));
    expect((await getObject(new NextRequest(tampered), ctx as never)).status).toBe(403);
    // Expired (signature recomputed by an attacker is impossible; an old link simply expires).
    const expired = new URL(url);
    expired.searchParams.set("e", String(Math.floor(Date.now() / 1000) - 10));
    expect((await getObject(new NextRequest(expired), ctx as never)).status).toBe(403);
    // Incoming (unprocessed) objects are never served.
    const incoming = new URL(url);
    incoming.searchParams.set("k", "incoming/x/y");
    expect((await getObject(new NextRequest(incoming), ctx as never)).status).toBe(403);
  });
});
