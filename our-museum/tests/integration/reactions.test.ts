import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/database/prisma";
import { createMuseum, updateMuseum } from "@/services/museum-service";
import { toggleReaction } from "@/services/reaction-service";
import { getScene } from "@/services/scene-service";
import { addMember, createUser, resetDatabase } from "../helpers/factories";

async function setup() {
  const owner = await createUser("Owner");
  const museum = await createMuseum(owner, { name: "Ours", description: "", templateId: "warm-romantic" }, "en");
  const photo = await prisma.photo.create({
    data: {
      museumId: museum.id,
      uploadedById: owner.id,
      storageKey: `museums/${museum.id}/photos/p/original.jpg`,
      largeKey: `museums/${museum.id}/photos/p/large.webp`,
      mediumKey: `museums/${museum.id}/photos/p/medium.webp`,
      thumbnailKey: `museums/${museum.id}/photos/p/thumb.webp`,
      originalFilename: "x.jpg",
      mimeType: "image/jpeg",
      width: 800,
      height: 600,
      sizeBytes: 100,
    },
  });
  return { owner, museum, photo };
}

describe("reactions", () => {
  beforeEach(resetDatabase);

  it("toggles reactions per person and reports totals in the scene", async () => {
    const { owner, museum, photo } = await setup();
    const visitor = await createUser("Visitor");
    await addMember(museum.id, visitor.id, "VISITOR");
    expect(await toggleReaction(owner.id, museum.id, photo.id, "❤️")).toMatchObject({ added: true, reactions: { "❤️": 1 }, myReactions: ["❤️"] });
    expect(await toggleReaction(visitor.id, museum.id, photo.id, "❤️")).toMatchObject({ added: true, reactions: { "❤️": 2 } });
    await toggleReaction(visitor.id, museum.id, photo.id, "✨");
    const scene = await getScene(visitor, museum.id);
    expect(scene.photos[0]).toMatchObject({ reactions: { "❤️": 2, "✨": 1 } });
    expect(new Set(scene.photos[0]!.myReactions)).toEqual(new Set(["❤️", "✨"]));
    expect(await toggleReaction(owner.id, museum.id, photo.id, "❤️")).toMatchObject({ added: false, reactions: { "❤️": 1 }, myReactions: [] });
  });

  it("respects membership, museum boundaries and the privacy switch", async () => {
    const { owner, museum, photo } = await setup();
    const other = await setup();
    const stranger = await createUser("Stranger");
    await expect(toggleReaction(stranger.id, museum.id, photo.id, "❤️")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(toggleReaction(owner.id, museum.id, other.photo.id, "❤️")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await updateMuseum(owner.id, museum.id, { privacy: { reactionsEnabled: false } });
    await expect(toggleReaction(owner.id, museum.id, photo.id, "❤️")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
