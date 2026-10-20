import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/database/prisma";
import { createMuseum } from "@/services/museum-service";
import { getScene } from "@/services/scene-service";
import { deleteTour, saveTour } from "@/services/tour-service";
import { addMember, createUser, resetDatabase } from "../helpers/factories";

async function setupWithFrames(count = 3) {
  const owner = await createUser("Owner");
  const museum = await createMuseum(owner, { name: "Ours", description: "", templateId: "warm-romantic" }, "en");
  const room = await prisma.museumRoom.findFirstOrThrow({ where: { museumId: museum.id }, include: { walls: true } });
  const wall = room.walls[0]!;
  const frameIds: string[] = [];
  for (let i = 0; i < count; i++) {
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
      data: { museumId: museum.id, roomId: room.id, wallId: wall.id, photoId: photo.id, positionU: i * 1.5 - 1.5, positionV: 1.6, width: 0.8, height: 0.6, frameStyle: "gallery-black", createdById: owner.id },
    });
    frameIds.push(frame.id);
  }
  return { owner, museum, frameIds };
}

describe("guided tours", () => {
  beforeEach(resetDatabase);

  it("creates, reorders and deletes tours that appear in the scene", async () => {
    const { owner, museum, frameIds } = await setupWithFrames();
    const tour = await saveTour(owner.id, museum.id, {
      name: "Our first year",
      stops: [
        { frameId: frameIds[0]!, note: "Where it began" },
        { frameId: frameIds[2]!, note: "" },
      ],
    });
    expect(tour.stops.map((s) => s.frameId)).toEqual([frameIds[0], frameIds[2]]);

    const updated = await saveTour(owner.id, museum.id, { name: "Our first year", stops: [{ frameId: frameIds[2]! }, { frameId: frameIds[1]! }, { frameId: frameIds[0]!, note: "Back" }] }, tour.id);
    expect(updated.id).toBe(tour.id);
    const scene = await getScene(owner, museum.id);
    expect(scene.tours[0]?.stops.map((s) => s.frameId)).toEqual([frameIds[2], frameIds[1], frameIds[0]]);
    expect(scene.tours[0]?.stops[2]?.note).toBe("Back");

    // Removing a photograph from the wall removes it from tours too.
    await prisma.photoFrame.delete({ where: { id: frameIds[1]! } });
    expect((await getScene(owner, museum.id)).tours[0]?.stops).toHaveLength(2);

    await deleteTour(owner.id, museum.id, tour.id);
    expect(await prisma.guidedTour.count()).toBe(0);
    expect(await prisma.photoFrame.count({ where: { museumId: museum.id } })).toBe(2);
  });

  it("only accepts frames from the same museum and enforces permissions", async () => {
    const { owner, museum, frameIds } = await setupWithFrames(1);
    const other = await setupWithFrames(1);
    await expect(saveTour(owner.id, museum.id, { name: "x", stops: [{ frameId: other.frameIds[0]! }] })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(saveTour(owner.id, museum.id, { name: "x", stops: [] })).rejects.toThrow();

    const visitor = await createUser("Visitor");
    await addMember(museum.id, visitor.id, "VISITOR");
    await expect(saveTour(visitor.id, museum.id, { name: "x", stops: [{ frameId: frameIds[0]! }] })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const editor = await createUser("Editor");
    await addMember(museum.id, editor.id, "EDITOR");
    const tour = await saveTour(editor.id, museum.id, { name: "Editor's tour", stops: [{ frameId: frameIds[0]! }] });
    // Another museum's owner can't touch it.
    await expect(deleteTour(other.owner.id, museum.id, tour.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(saveTour(owner.id, other.museum.id, { name: "x", stops: [{ frameId: other.frameIds[0]! }] }, tour.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
