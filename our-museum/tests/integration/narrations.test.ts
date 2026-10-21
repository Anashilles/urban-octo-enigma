import { readdir } from "node:fs/promises";
import path from "node:path";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as getObject } from "@/app/api/storage/object/route";
import { prisma } from "@/lib/database/prisma";
import { parseRange } from "@/lib/http-range";
import { detectAudioFormat, MAX_NARRATION_BYTES } from "@/lib/validation/narration";
import { createMuseum, deleteMuseum } from "@/services/museum-service";
import { cleanupOrphanNarrations, deleteNarration, saveNarration } from "@/services/narration-service";
import { deleteFrame } from "@/services/photo-placement-service";
import { deletePhoto } from "@/services/photo-service";
import { getScene } from "@/services/scene-service";
import { processDeletionQueue, storage } from "@/services/storage";
import { deleteTour, saveTour } from "@/services/tour-service";
import { addMember, createUser, resetDatabase } from "../helpers/factories";

const ctx = { params: Promise.resolve({}) };

/** Bytes with a real container signature; the server checks content, not the declared type. */
function webm(size = 2048) {
  const b = new Uint8Array(size).fill(7);
  b.set([0x1a, 0x45, 0xdf, 0xa3]);
  return b;
}
function ogg(size = 1024) {
  const b = new Uint8Array(size).fill(3);
  b.set([0x4f, 0x67, 0x67, 0x53]);
  return b;
}

async function setup(frames = 3) {
  const owner = await createUser("Owner");
  const museum = await createMuseum(owner, { name: "Ours", description: "", templateId: "warm-romantic" }, "en");
  const room = await prisma.museumRoom.findFirstOrThrow({ where: { museumId: museum.id }, include: { walls: true } });
  const frameIds: string[] = [];
  const photoIds: string[] = [];
  for (let i = 0; i < frames; i++) {
    const photo = await prisma.photo.create({
      data: {
        museumId: museum.id,
        uploadedById: owner.id,
        storageKey: `museums/${museum.id}/photos/p${i}/original.jpg`,
        largeKey: `museums/${museum.id}/photos/p${i}/large.webp`,
        mediumKey: `museums/${museum.id}/photos/p${i}/medium.webp`,
        thumbnailKey: `museums/${museum.id}/photos/p${i}/thumb.webp`,
        originalFilename: "x.jpg",
        mimeType: "image/jpeg",
        width: 800,
        height: 600,
        sizeBytes: 100,
      },
    });
    const frame = await prisma.photoFrame.create({
      data: { museumId: museum.id, roomId: room.id, wallId: room.walls[0]!.id, photoId: photo.id, positionU: i * 1.5 - 1.5, positionV: 1.6, width: 0.8, height: 0.6, frameStyle: "gallery-black", createdById: owner.id },
    });
    frameIds.push(frame.id);
    photoIds.push(photo.id);
  }
  const tour = await saveTour(owner.id, museum.id, { name: "Our year", stops: frameIds.map((frameId) => ({ frameId })) });
  return { owner, museum, tour, frameIds, photoIds };
}

const keyOf = async (tourId: string, frameId: string) => (await prisma.tourNarration.findFirst({ where: { tourId, frameId } }))?.storageKey ?? null;

/** Drains the deletion queue and waits until the files are gone. */
async function expectDeleted(keys: string[]) {
  await processDeletionQueue();
  await vi.waitFor(async () => {
    for (const key of keys) expect(await storage().head(key)).toBeNull();
  });
}

describe("tour narrations", () => {
  beforeEach(resetDatabase);

  it("records a stop's narration, serves it privately in byte ranges, and replaces it", async () => {
    const { owner, museum, tour, frameIds } = await setup();
    const saved = await saveNarration(owner.id, museum.id, tour.id, frameIds[0]!, webm(), 4200);
    expect(saved.durationMs).toBe(4200);

    const scene = await getScene(owner, museum.id);
    const [first, second] = scene.tours[0]!.stops;
    expect(first!.narration).toMatchObject({ durationMs: 4200, url: expect.stringMatching(/^\/api\/storage\/object\?/) });
    expect(second!.narration).toBeNull();
    const key = (await keyOf(tour.id, frameIds[0]!))!;
    expect(key).toMatch(new RegExp(`^museums/${museum.id}/narrations/${tour.id}/[0-9a-f]{24}\\.webm$`));

    // Signed, private, and seekable.
    const url = new URL(first!.narration!.url, "http://localhost:3000");
    const whole = await getObject(new NextRequest(url), ctx as never);
    expect(whole.status).toBe(200);
    expect(whole.headers.get("content-type")).toBe("audio/webm");
    expect(whole.headers.get("accept-ranges")).toBe("bytes");
    const part = await getObject(new NextRequest(url, { headers: { range: "bytes=0-3" } }), ctx as never);
    expect(part.status).toBe(206);
    expect(part.headers.get("content-range")).toBe("bytes 0-3/2048");
    expect([...new Uint8Array(await part.arrayBuffer())]).toEqual([0x1a, 0x45, 0xdf, 0xa3]);
    const tail = await getObject(new NextRequest(url, { headers: { range: "bytes=-10" } }), ctx as never);
    expect(tail.headers.get("content-range")).toBe("bytes 2038-2047/2048");
    expect((await getObject(new NextRequest(url, { headers: { range: "bytes=5000-" } }), ctx as never)).status).toBe(416);

    // Re-recording replaces the file; the old one is deleted.
    await saveNarration(owner.id, museum.id, tour.id, frameIds[0]!, ogg(), 9000);
    const replaced = (await getScene(owner, museum.id)).tours[0]!.stops[0]!.narration!;
    expect(replaced.durationMs).toBe(9000);
    expect(replaced.url).not.toBe(first!.narration!.url);
    expect(await keyOf(tour.id, frameIds[0]!)).toMatch(/\.ogg$/);
    expect(await prisma.tourNarration.count()).toBe(1);
    await expectDeleted([key]);
  });

  it("keeps one file when the same stop is recorded several times at once", async () => {
    const { owner, museum, tour, frameIds } = await setup(1);
    await Promise.all([1, 2, 3].map((i) => saveNarration(owner.id, museum.id, tour.id, frameIds[0]!, webm(1000 + i), 2000 + i)));
    expect(await prisma.tourNarration.count()).toBe(1);
    const kept = (await keyOf(tour.id, frameIds[0]!))!;
    await processDeletionQueue();
    await vi.waitFor(async () => {
      const dir = path.join(".data/test-storage", `museums/${museum.id}/narrations/${tour.id}`);
      const files = (await readdir(dir)).filter((f) => !f.endsWith(".meta.json"));
      expect(files).toEqual([path.basename(kept)]);
    });
  });

  it("keeps narrations when a tour is reordered and drops them with removed stops", async () => {
    const { owner, museum, tour, frameIds } = await setup();
    await saveNarration(owner.id, museum.id, tour.id, frameIds[0]!, webm(), 3000);
    await saveNarration(owner.id, museum.id, tour.id, frameIds[1]!, webm(), 5000);
    const removedKey = (await keyOf(tour.id, frameIds[1]!))!;

    // Saving a tour rewrites its stops; narrations follow the photograph.
    await saveTour(owner.id, museum.id, { name: "Our year", stops: [{ frameId: frameIds[2]! }, { frameId: frameIds[0]! }] }, tour.id);
    const stops = (await getScene(owner, museum.id)).tours[0]!.stops;
    expect(stops.map((s) => s.narration?.durationMs ?? null)).toEqual([null, 3000]);
    expect(await prisma.tourNarration.count()).toBe(1);
    await expectDeleted([removedKey]);
  });

  it("removes narrations with their frame, photo, tour and museum", async () => {
    const { owner, museum, tour, frameIds, photoIds } = await setup();
    for (const [i, frameId] of frameIds.entries()) await saveNarration(owner.id, museum.id, tour.id, frameId, webm(), 1000 + i);
    const keys = await Promise.all(frameIds.map((f) => keyOf(tour.id, f)));

    await deleteFrame(owner.id, museum.id, frameIds[0]!);
    expect(await keyOf(tour.id, frameIds[0]!)).toBeNull();
    await deletePhoto(owner.id, museum.id, photoIds[1]!);
    expect(await keyOf(tour.id, frameIds[1]!)).toBeNull();
    await deleteTour(owner.id, museum.id, tour.id);
    expect(await prisma.tourNarration.count()).toBe(0);
    await expectDeleted(keys as string[]);

    const again = await saveTour(owner.id, museum.id, { name: "Again", stops: [{ frameId: frameIds[2]! }] });
    await saveNarration(owner.id, museum.id, again.id, frameIds[2]!, webm(), 2000);
    const last = (await keyOf(again.id, frameIds[2]!))!;
    await deleteMuseum(owner.id, museum.id);
    await expectDeleted([last]);
  });

  it("accepts only short audio recordings for stops of the tour", async () => {
    const { owner, museum, tour, frameIds } = await setup(2);
    const text = new TextEncoder().encode("<script>alert(1)</script>.......");
    await expect(saveNarration(owner.id, museum.id, tour.id, frameIds[0]!, text, 3000)).rejects.toMatchObject({ code: "UNSUPPORTED_MEDIA_TYPE" });
    await expect(saveNarration(owner.id, museum.id, tour.id, frameIds[0]!, webm(MAX_NARRATION_BYTES + 1), 3000)).rejects.toMatchObject({ code: "PAYLOAD_TOO_LARGE" });
    await expect(saveNarration(owner.id, museum.id, tour.id, frameIds[0]!, new Uint8Array(), 3000)).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(saveNarration(owner.id, museum.id, tour.id, frameIds[0]!, webm(), 3 * 60_000 + 1)).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(saveNarration(owner.id, museum.id, tour.id, frameIds[0]!, webm(), Number.NaN)).rejects.toMatchObject({ code: "VALIDATION_FAILED" });

    // A photograph that isn't a stop, or a tour from another museum.
    await saveTour(owner.id, museum.id, { name: "Short", stops: [{ frameId: frameIds[0]! }] }, tour.id);
    await expect(saveNarration(owner.id, museum.id, tour.id, frameIds[1]!, webm(), 3000)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const other = await setup(1);
    await expect(saveNarration(owner.id, museum.id, other.tour.id, other.frameIds[0]!, webm(), 3000)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await prisma.tourNarration.count()).toBe(0);
  });

  it("is recorded by owners and editors only", async () => {
    const { owner, museum, tour, frameIds } = await setup(2);
    const editor = await createUser("Editor");
    const visitor = await createUser("Visitor");
    const stranger = await createUser("Stranger");
    await addMember(museum.id, editor.id, "EDITOR");
    await addMember(museum.id, visitor.id, "VISITOR");

    await saveNarration(editor.id, museum.id, tour.id, frameIds[0]!, webm(), 3000);
    await expect(saveNarration(visitor.id, museum.id, tour.id, frameIds[1]!, webm(), 3000)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(saveNarration(stranger.id, museum.id, tour.id, frameIds[1]!, webm(), 3000)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(deleteNarration(visitor.id, museum.id, tour.id, frameIds[0]!)).rejects.toMatchObject({ code: "FORBIDDEN" });
    // Visitors hear it.
    expect((await getScene(visitor, museum.id)).tours[0]!.stops[0]!.narration?.durationMs).toBe(3000);

    await deleteNarration(owner.id, museum.id, tour.id, frameIds[0]!);
    expect((await getScene(visitor, museum.id)).tours[0]!.stops[0]!.narration).toBeNull();
    await expect(deleteNarration(owner.id, museum.id, tour.id, frameIds[0]!)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("sweeps orphaned narrations from every museum", async () => {
    const a = await setup(1);
    const b = await setup(1);
    await saveNarration(a.owner.id, a.museum.id, a.tour.id, a.frameIds[0]!, webm(), 3000);
    await saveNarration(b.owner.id, b.museum.id, b.tour.id, b.frameIds[0]!, webm(), 3000);
    // Stops removed behind the service's back (as an interrupted request might leave them).
    await prisma.tourStop.deleteMany({ where: { tourId: { in: [a.tour.id, b.tour.id] } } });
    expect(await cleanupOrphanNarrations()).toBe(2);
    expect(await prisma.tourNarration.count()).toBe(0);
    expect(await cleanupOrphanNarrations()).toBe(0);
  });
});

describe("audio and range helpers", () => {
  it("recognises recordings by their content", () => {
    expect(detectAudioFormat(webm(16))).toBe("webm");
    expect(detectAudioFormat(ogg(16))).toBe("ogg");
    const m4a = new Uint8Array(16);
    m4a.set([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70]);
    expect(detectAudioFormat(m4a)).toBe("mp4");
    expect(detectAudioFormat(new Uint8Array(16))).toBeNull();
    expect(detectAudioFormat(webm(4))).toBeNull();
  });

  it("parses single byte ranges", () => {
    expect(parseRange(null, 100)).toBeNull();
    expect(parseRange("bytes=0-", 100)).toEqual([0, 99]);
    expect(parseRange("bytes=10-19", 100)).toEqual([10, 19]);
    expect(parseRange("bytes=90-500", 100)).toEqual([90, 99]);
    expect(parseRange("bytes=-5", 100)).toEqual([95, 99]);
    expect(parseRange("bytes=-500", 100)).toEqual([0, 99]);
    expect(parseRange("bytes=100-", 100)).toBe("unsatisfiable");
    expect(parseRange("bytes=20-10", 100)).toBe("unsatisfiable");
    expect(parseRange("bytes=-0", 100)).toBe("unsatisfiable");
    expect(parseRange("bytes=0-1,5-6", 100)).toBeNull();
    expect(parseRange("items=0-1", 100)).toBeNull();
  });
});
