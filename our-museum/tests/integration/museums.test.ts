import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/database/prisma";
import { deleteAllMuseumsOwnedBy, createMuseum, deleteMuseum, getDashboard, updateMuseum } from "@/services/museum-service";
import { placeFrame } from "@/services/photo-placement-service";
import { createRoom, deleteRoom, reorderRooms, updateRoom, findInvalidFrames } from "@/services/room-service";
import { getScene } from "@/services/scene-service";
import { processDeletionQueue, storage } from "@/services/storage";
import { validateLayout } from "@/features/rooms/geometry";
import { addMember, createUser, resetDatabase } from "../helpers/factories";

async function photoRow(museumId: string, userId: string, w = 1200, h = 800) {
  const id = `ph${Math.random().toString(36).slice(2, 12)}`;
  return prisma.photo.create({
    data: {
      id,
      museumId,
      uploadedById: userId,
      storageKey: `museums/${museumId}/photos/${id}/original.jpg`,
      largeKey: `museums/${museumId}/photos/${id}/large.webp`,
      mediumKey: `museums/${museumId}/photos/${id}/medium.webp`,
      thumbnailKey: `museums/${museumId}/photos/${id}/thumb.webp`,
      originalFilename: "x.jpg",
      mimeType: "image/jpeg",
      width: w,
      height: h,
      sizeBytes: 1000,
      title: "Photo",
    },
  });
}

describe("museums", () => {
  beforeEach(resetDatabase);

  it("creates a museum with owner membership, eight rooms, walls and starter collections", async () => {
    const owner = await createUser();
    const museum = await createMuseum(owner, { name: "Ours", description: "", templateId: "warm-romantic" }, "ar");
    expect(await prisma.museumMembership.findMany({ where: { museumId: museum.id } })).toMatchObject([{ userId: owner.id, role: "OWNER" }]);
    expect(await prisma.museumRoom.count({ where: { museumId: museum.id } })).toBe(8);
    expect(await prisma.museumWall.count({ where: { room: { museumId: museum.id } } })).toBe(32);
    expect(await prisma.photoCollection.count({ where: { museumId: museum.id } })).toBe(6);
    // Room names follow the creator's language.
    expect((await prisma.museumRoom.findFirstOrThrow({ where: { museumId: museum.id, roomType: "lobby" } })).name).toBe("ردهة المدخل");
    const scene = await getScene(owner, museum.id);
    expect(validateLayout(scene.rooms)).toEqual([]);
    expect(scene.viewer.role).toBe("OWNER");
  });

  it("refuses museum creation for guest accounts", async () => {
    const guest = { ...(await createUser()), isAnonymous: true };
    await expect(createMuseum(guest, { name: "x", description: "", templateId: "minimal-white" }, "en")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("shows owned and shared museums on the dashboard", async () => {
    const a = await createUser("A");
    const b = await createUser("B");
    const m = await createMuseum(a, { name: "A's", description: "", templateId: "minimal-white" }, "en");
    await addMember(m.id, b.id, "VISITOR");
    expect((await getDashboard(a)).owned.map((c) => c.id)).toEqual([m.id]);
    expect((await getDashboard(b)).shared.map((c) => c.role)).toEqual(["VISITOR"]);
  });

  it("only lets the owner change privacy and delete; visitors cannot edit", async () => {
    const owner = await createUser();
    const editor = await createUser();
    const visitor = await createUser();
    const m = await createMuseum(owner, { name: "M", description: "", templateId: "minimal-white" }, "en");
    await addMember(m.id, editor.id, "EDITOR");
    await addMember(m.id, visitor.id, "VISITOR");
    await expect(updateMuseum(visitor.id, m.id, { name: "Hacked" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(updateMuseum(editor.id, m.id, { privacy: { voiceChatEnabled: false } })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await updateMuseum(editor.id, m.id, { name: "Renamed", theme: { lightingPreset: "warm" } });
    await expect(deleteMuseum(editor.id, m.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await updateMuseum(owner.id, m.id, { privacy: { guestsCanStartSharedViewing: false } });
    const scene = await getScene(visitor, m.id);
    expect(scene.museum.name).toBe("Renamed");
    expect(scene.theme.lightingPreset).toBe("warm");
    expect(scene.viewer.permissions["shared.start"]).toBe(false);
    expect(scene.viewer.permissions["frame.place"]).toBe(false);
    await deleteMuseum(owner.id, m.id);
    expect(await prisma.museum.count()).toBe(0);
  });

  it("deletes every stored file when an account's museums are deleted", async () => {
    const owner = await createUser();
    const m = await createMuseum(owner, { name: "M", description: "", templateId: "minimal-white" }, "en");
    const photo = await photoRow(m.id, owner.id);
    const keys = [photo.storageKey, photo.largeKey, photo.mediumKey, photo.thumbnailKey];
    for (const key of keys) await storage().put(key, Buffer.from("x"), "image/webp");
    await deleteAllMuseumsOwnedBy(owner.id);
    expect(await prisma.museum.count()).toBe(0);
    // The queue also starts in the background; draining it here makes the outcome deterministic.
    await processDeletionQueue();
    await vi.waitFor(async () => {
      expect(await prisma.storageDeletion.count()).toBe(0);
      for (const key of keys) expect(await storage().head(key)).toBeNull();
    });
  });
});

describe("rooms", () => {
  beforeEach(resetDatabase);

  it("adds a room attached to the layout with a matching doorway", async () => {
    const owner = await createUser();
    const m = await createMuseum(owner, { name: "M", description: "", templateId: "dark-luxury" }, "en");
    const room = await createRoom(owner.id, m.id, { name: "Annex", roomType: "custom", width: 6, depth: 6, height: 4 });
    const scene = await getScene(owner, m.id);
    expect(scene.rooms).toHaveLength(9);
    expect(validateLayout(scene.rooms)).toEqual([]);
    expect(scene.rooms.find((r) => r.id === room.id)!.layout.doorways).toHaveLength(1);
  });

  it("protects work: rooms with frames need confirmation, and frames are removed with the room", async () => {
    const owner = await createUser();
    const m = await createMuseum(owner, { name: "M", description: "", templateId: "minimal-white" }, "en");
    const scene = await getScene(owner, m.id);
    const final = scene.rooms.find((r) => r.roomType === "custom")!;
    const photo = await photoRow(m.id, owner.id);
    await placeFrame(owner.id, m.id, { photoId: photo.id, roomId: final.id, wallKey: "west", u: 0, v: 1.55, width: 0.9, rotation: 0, style: "minimal-black", options: {} });
    await expect(deleteRoom(owner.id, m.id, final.id)).rejects.toMatchObject({ code: "CONFLICT", details: { reason: "has_frames", frameCount: 1 } });
    expect(await deleteRoom(owner.id, m.id, final.id, { confirm: true })).toEqual({ frameCount: 1 });
    expect(await prisma.photoFrame.count()).toBe(0);
    // The photo itself stays in the library.
    expect(await prisma.photo.count()).toBe(1);
    const after = await getScene(owner, m.id);
    expect(validateLayout(after.rooms)).toEqual([]);
    expect(await findInvalidFrames(m.id)).toEqual([]);
  });

  it("refuses to delete the lobby or a room that would disconnect others", async () => {
    const owner = await createUser();
    const m = await createMuseum(owner, { name: "M", description: "", templateId: "minimal-white" }, "en");
    const scene = await getScene(owner, m.id);
    const lobby = scene.rooms.find((r) => r.roomType === "lobby")!;
    const hall = scene.rooms.find((r) => r.roomType === "hall")!;
    await expect(deleteRoom(owner.id, m.id, lobby.id)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(deleteRoom(owner.id, m.id, hall.id)).rejects.toMatchObject({ code: "CONFLICT", details: { reason: "disconnects" } });
  });

  it("lets editors rename and restyle rooms but not add or delete them", async () => {
    const owner = await createUser();
    const editor = await createUser();
    const m = await createMuseum(owner, { name: "M", description: "", templateId: "minimal-white" }, "en");
    await addMember(m.id, editor.id, "EDITOR");
    const scene = await getScene(owner, m.id);
    const room = scene.rooms[2]!;
    const updated = await updateRoom(editor.id, m.id, room.id, { name: "Paris 2019", wallColor: "#aabbcc", floorMaterial: "marble-white" });
    expect(updated).toMatchObject({ name: "Paris 2019", layout: { wallColor: "#aabbcc", floorMaterial: "marble-white" } });
    await expect(createRoom(editor.id, m.id, { name: "x", roomType: "custom", width: 6, depth: 6, height: 4 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(deleteRoom(editor.id, m.id, room.id, { confirm: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await reorderRooms(editor.id, m.id, [...scene.rooms].reverse().map((r) => r.id));
    expect((await getScene(owner, m.id)).rooms[0]!.id).toBe(scene.rooms.at(-1)!.id);
  });
});
