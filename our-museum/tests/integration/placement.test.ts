import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/database/prisma";
import { createMuseum } from "@/services/museum-service";
import { deleteFrame, placeFrame, updateFrame } from "@/services/photo-placement-service";
import { getScene } from "@/services/scene-service";
import { addMember, createUser, resetDatabase } from "../helpers/factories";

async function setup() {
  const owner = await createUser("Owner");
  const museum = await createMuseum(owner, { name: "M", description: "", templateId: "minimal-white" }, "en");
  const scene = await getScene(owner, museum.id);
  // The final room (6×6) has a doorway on its east wall only.
  const room = scene.rooms.find((r) => r.roomType === "custom")!;
  const id = `ph${Math.random().toString(36).slice(2, 12)}`;
  const photo = await prisma.photo.create({
    data: {
      id,
      museumId: museum.id,
      uploadedById: owner.id,
      storageKey: `k/${id}/o`,
      largeKey: `k/${id}/l`,
      mediumKey: `k/${id}/m`,
      thumbnailKey: `k/${id}/t`,
      originalFilename: "p.jpg",
      mimeType: "image/jpeg",
      width: 900,
      height: 1200,
      sizeBytes: 1,
    },
  });
  return { owner, museumId: museum.id, room, photo };
}

const base = { wallKey: "north" as const, u: 0, v: 1.55, width: 0.9, rotation: 0, style: "white-gallery" as const, options: {} };

describe("frame placement", () => {
  beforeEach(resetDatabase);

  it("places a frame and persists it exactly as saved", async () => {
    const { owner, museumId, room, photo } = await setup();
    const frame = await placeFrame(owner.id, museumId, { ...base, photoId: photo.id, roomId: room.id, u: 0.42 });
    const scene = await getScene(owner, museumId);
    expect(scene.frames).toHaveLength(1);
    expect(scene.frames[0]).toMatchObject({ id: frame.id, roomId: room.id, wallKey: "north", u: 0.42, v: 1.55, width: 0.9, style: "white-gallery" });
  });

  it("preserves the photo's aspect ratio regardless of the requested size", async () => {
    const { owner, museumId, room, photo } = await setup();
    const frame = await placeFrame(owner.id, museumId, { ...base, photoId: photo.id, roomId: room.id, width: 0.6 });
    expect(frame.width / frame.height).toBeCloseTo(900 / 1200, 2);
    const resized = await updateFrame(owner.id, museumId, frame.id, { width: 1.2 });
    expect(resized.height).toBeCloseTo(1.6, 3);
  });

  it("rejects placements outside the wall, over a doorway, or overlapping another frame", async () => {
    const { owner, museumId, room, photo } = await setup();
    const p = { ...base, photoId: photo.id, roomId: room.id };
    await expect(placeFrame(owner.id, museumId, { ...p, u: 2.9 })).rejects.toMatchObject({ code: "PLACEMENT_INVALID", details: { problem: "out_of_bounds" } });
    await expect(placeFrame(owner.id, museumId, { ...p, v: 3.5 })).rejects.toMatchObject({ code: "PLACEMENT_INVALID" });
    const door = room.layout.doorways[0]!;
    await expect(placeFrame(owner.id, museumId, { ...p, wallKey: door.wall, u: door.offset })).rejects.toMatchObject({
      code: "PLACEMENT_INVALID",
      details: { problem: "overlaps_doorway" },
    });
    await placeFrame(owner.id, museumId, p);
    await expect(placeFrame(owner.id, museumId, { ...p, u: 0.3 })).rejects.toMatchObject({ details: { problem: "overlaps_frame" } });
    // Intentional overlap is allowed when explicitly requested, and recorded.
    const overlapping = await placeFrame(owner.id, museumId, { ...p, u: 0.3, allowOverlap: true });
    expect(overlapping.metadata).toMatchObject({ overlapsIntentionally: [expect.any(String)] });
  });

  it("moves frames between walls and validates against the destination", async () => {
    const { owner, museumId, room, photo } = await setup();
    const frame = await placeFrame(owner.id, museumId, { ...base, photoId: photo.id, roomId: room.id });
    const moved = await updateFrame(owner.id, museumId, frame.id, { wallKey: "south", u: -1 });
    const scene = await getScene(owner, museumId);
    expect(scene.frames[0]).toMatchObject({ id: moved.id, wallKey: "south", u: -1 });
    await deleteFrame(owner.id, museumId, frame.id);
    expect((await getScene(owner, museumId)).frames).toHaveLength(0);
  });

  it("refuses edits based on an outdated version and reports the current frame", async () => {
    const { owner, museumId, room, photo } = await setup();
    const editor = await createUser("Editor");
    await addMember(museumId, editor.id, "EDITOR");
    const frame = await placeFrame(owner.id, museumId, { ...base, photoId: photo.id, roomId: room.id });
    expect(frame.version).toBe(1);
    // Both open version 1; the owner saves first.
    const ownerMove = await updateFrame(owner.id, museumId, frame.id, { u: -0.8, expectedVersion: 1 });
    expect(ownerMove.version).toBe(2);
    await expect(updateFrame(editor.id, museumId, frame.id, { u: 0.8, expectedVersion: 1 })).rejects.toMatchObject({
      code: "CONFLICT",
      details: { reason: "stale_frame", frame: { id: frame.id, u: -0.8, version: 2 } },
    });
    // Having seen version 2, the editor's change goes through.
    expect(await updateFrame(editor.id, museumId, frame.id, { u: 0.8, expectedVersion: 2 })).toMatchObject({ positionU: 0.8, version: 3 });
    expect((await getScene(owner, museumId)).frames[0]).toMatchObject({ u: 0.8, version: 3 });
  });

  it("lets exactly one of two simultaneous edits of the same version win", async () => {
    const { owner, museumId, room, photo } = await setup();
    const frame = await placeFrame(owner.id, museumId, { ...base, photoId: photo.id, roomId: room.id });
    const results = await Promise.allSettled([
      updateFrame(owner.id, museumId, frame.id, { u: -0.9, expectedVersion: 1 }),
      updateFrame(owner.id, museumId, frame.id, { u: 0.9, expectedVersion: 1 }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({ reason: { code: "CONFLICT" } });
    expect((await getScene(owner, museumId)).frames[0]!.version).toBe(2);
  });

  it("does not let visitors or strangers change the layout", async () => {
    const { owner, museumId, room, photo } = await setup();
    const visitor = await createUser("Visitor");
    const stranger = await createUser("Stranger");
    await addMember(museumId, visitor.id, "VISITOR");
    const frame = await placeFrame(owner.id, museumId, { ...base, photoId: photo.id, roomId: room.id });
    await expect(placeFrame(visitor.id, museumId, { ...base, photoId: photo.id, roomId: room.id, u: -1.5 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(updateFrame(visitor.id, museumId, frame.id, { u: 0.5 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(deleteFrame(visitor.id, museumId, frame.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(placeFrame(stranger.id, museumId, { ...base, photoId: photo.id, roomId: room.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("does not accept photos or rooms from another museum", async () => {
    const a = await setup();
    const b = await setup();
    await expect(placeFrame(a.owner.id, a.museumId, { ...base, photoId: b.photo.id, roomId: a.room.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(placeFrame(a.owner.id, a.museumId, { ...base, photoId: a.photo.id, roomId: b.room.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
