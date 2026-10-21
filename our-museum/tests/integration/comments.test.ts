import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/database/prisma";
import { addComment, deleteComment, deleteGuestbookEntry, listComments, listGuestbook, signGuestbook } from "@/services/comment-service";
import { createMuseum, updateMuseum } from "@/services/museum-service";
import { getScene } from "@/services/scene-service";
import { addMember, createUser, resetDatabase } from "../helpers/factories";

async function setup() {
  const owner = await createUser("Owner");
  const museum = await createMuseum(owner, { name: "Family", description: "", templateId: "minimal-white" }, "en");
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
      width: 800,
      height: 600,
      sizeBytes: 1,
    },
  });
  const visitor = await createUser("Visitor");
  await addMember(museum.id, visitor.id, "VISITOR");
  return { owner, visitor, museumId: museum.id, photoId: photo.id };
}

describe("photo comments", () => {
  beforeEach(resetDatabase);

  it("lets members comment, lists oldest first, and counts them in the scene", async () => {
    const { owner, visitor, museumId, photoId } = await setup();
    await addComment(visitor.id, museumId, photoId, { body: "  Look at grandma's hat!  " });
    const second = await addComment(owner.id, museumId, photoId, { body: "1987, Alexandria\n\n\n\nbeach" });
    expect(second.body).toBe("1987, Alexandria\n\nbeach");
    const { comments } = await listComments(visitor.id, museumId, photoId);
    expect(comments.map((c) => c.body)).toEqual(["Look at grandma's hat!", "1987, Alexandria\n\nbeach"]);
    expect(comments[0]).toMatchObject({ author: { self: true, guest: false }, canDelete: true });
    expect(comments[1]).toMatchObject({ author: { self: false }, canDelete: false });
    const scene = await getScene(owner, museumId);
    expect(scene.photos[0]!.commentCount).toBe(2);
  });

  it("validates the text", async () => {
    const { visitor, museumId, photoId } = await setup();
    await expect(addComment(visitor.id, museumId, photoId, { body: "   \n  " })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(addComment(visitor.id, museumId, photoId, { body: "x".repeat(1001) })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(addComment(visitor.id, museumId, photoId, { body: 42 })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("only authors and the owner can delete, and owner removals are audited", async () => {
    const { owner, visitor, museumId, photoId } = await setup();
    const editor = await createUser("Editor");
    await addMember(museumId, editor.id, "EDITOR");
    const c1 = await addComment(visitor.id, museumId, photoId, { body: "first" });
    const c2 = await addComment(visitor.id, museumId, photoId, { body: "second" });
    await expect(deleteComment(editor.id, museumId, c1.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await deleteComment(visitor.id, museumId, c1.id);
    await deleteComment(owner.id, museumId, c2.id);
    expect((await listComments(owner.id, museumId, photoId)).comments).toHaveLength(0);
    expect(await prisma.museumEvent.count({ where: { eventType: "comment.removed" } })).toBe(1);
  });

  it("keeps outsiders out and ids from other museums unusable", async () => {
    const a = await setup();
    const b = await setup();
    const stranger = await createUser("Stranger");
    await expect(addComment(stranger.id, a.museumId, a.photoId, { body: "hi" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(listComments(stranger.id, a.museumId, a.photoId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    // A member of museum A cannot comment on (or read) a photo of museum B through A.
    await expect(addComment(a.visitor.id, a.museumId, b.photoId, { body: "hi" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const inB = await addComment(b.visitor.id, b.museumId, b.photoId, { body: "mine" });
    await expect(deleteComment(a.owner.id, a.museumId, inB.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("respects the owner's switch: hidden and refused when turned off, kept for later", async () => {
    const { owner, visitor, museumId, photoId } = await setup();
    await addComment(visitor.id, museumId, photoId, { body: "kept" });
    await updateMuseum(owner.id, museumId, { privacy: { commentsEnabled: false } });
    expect(await listComments(visitor.id, museumId, photoId)).toEqual({ enabled: false, comments: [] });
    await expect(addComment(visitor.id, museumId, photoId, { body: "no" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(signGuestbook(visitor.id, museumId, { body: "no" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await getScene(owner, museumId)).photos[0]!.commentCount).toBe(0);
    await updateMuseum(owner.id, museumId, { privacy: { commentsEnabled: true } });
    expect((await listComments(visitor.id, museumId, photoId)).comments.map((c) => c.body)).toEqual(["kept"]);
  });

  it("removes a person's comments and guestbook entries with their account", async () => {
    const { visitor, museumId, photoId } = await setup();
    await addComment(visitor.id, museumId, photoId, { body: "bye" });
    await signGuestbook(visitor.id, museumId, { body: "bye" });
    await prisma.user.delete({ where: { id: visitor.id } });
    expect(await prisma.photoComment.count()).toBe(0);
    expect(await prisma.guestbookEntry.count()).toBe(0);
  });
});

describe("guestbook", () => {
  beforeEach(resetDatabase);

  it("collects entries newest first with author names, and guests are marked", async () => {
    const { owner, visitor, museumId } = await setup();
    const guest = await createUser("Guest", { isAnonymous: true });
    await addMember(museumId, guest.id, "VISITOR");
    await signGuestbook(visitor.id, museumId, { body: "What a lovely museum" });
    await signGuestbook(guest.id, museumId, { body: "Thank you for inviting me" });
    const { entries } = await listGuestbook(owner.id, museumId);
    expect(entries.map((e) => e.body)).toEqual(["Thank you for inviting me", "What a lovely museum"]);
    expect(entries[0]!.author).toMatchObject({ guest: true, self: false });
    expect(entries.every((e) => e.canDelete)).toBe(true); // the owner moderates
    expect((await getScene(owner, museumId)).museum.guestbookCount).toBe(2);
    await expect(signGuestbook(visitor.id, museumId, { body: "x".repeat(501) })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("only authors and the owner can delete entries", async () => {
    const { owner, visitor, museumId } = await setup();
    const other = await createUser("Other");
    await addMember(museumId, other.id, "VISITOR");
    const e = await signGuestbook(visitor.id, museumId, { body: "hello" });
    await expect(deleteGuestbookEntry(other.id, museumId, e.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await deleteGuestbookEntry(owner.id, museumId, e.id);
    expect((await listGuestbook(owner.id, museumId)).entries).toHaveLength(0);
    expect(await prisma.museumEvent.count({ where: { eventType: "guestbook.removed" } })).toBe(1);
  });
});
