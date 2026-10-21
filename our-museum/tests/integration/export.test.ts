import { unzipSync, strFromU8 } from "fflate";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/database/prisma";
import { setCollectionPhotos } from "@/services/collection-service";
import { addComment, signGuestbook } from "@/services/comment-service";
import { exportMuseum, slugify } from "@/services/export-service";
import { createMuseum } from "@/services/museum-service";
import { placeFrame } from "@/services/photo-placement-service";
import { getScene } from "@/services/scene-service";
import { storage } from "@/services/storage";
import { saveTour } from "@/services/tour-service";
import { addMember, createUser, makeJpeg, resetDatabase } from "../helpers/factories";

async function photoWithFile(museumId: string, userId: string, title: string, bytes: Buffer | null) {
  const id = `ph${Math.random().toString(36).slice(2, 12)}`;
  const photo = await prisma.photo.create({
    data: {
      id,
      museumId,
      uploadedById: userId,
      storageKey: `museums/${museumId}/photos/${id}/original.jpg`,
      largeKey: `museums/${museumId}/photos/${id}/large.webp`,
      mediumKey: `museums/${museumId}/photos/${id}/medium.webp`,
      thumbnailKey: `museums/${museumId}/photos/${id}/thumb.webp`,
      originalFilename: "IMG_0042.jpg",
      mimeType: "image/jpeg",
      width: 640,
      height: 480,
      sizeBytes: bytes?.length ?? 0,
      title,
      caption: "Line one\nLine two",
      takenAt: new Date("1998-07-14T10:00:00Z"),
    },
  });
  if (bytes) await storage().put(photo.storageKey, bytes, "image/jpeg");
  return photo;
}

async function unzip(userId: string, museumId: string, locale: "en" | "ar" = "en") {
  const { stream, filename } = await exportMuseum(userId, museumId, locale);
  const files = unzipSync(new Uint8Array(await new Response(stream).arrayBuffer()));
  return { filename, files, manifest: JSON.parse(strFromU8(files["museum.json"]!)), html: strFromU8(files["index.html"]!) };
}

describe("museum export", () => {
  beforeEach(resetDatabase);

  it("packs original photos, a complete manifest and a safe offline page", async () => {
    const owner = await createUser("Owner");
    const museum = await createMuseum(owner, { name: "Family <Album>", description: "Summers", templateId: "minimal-white" }, "en");
    const bytesA = await makeJpeg(640, 480);
    const a = await photoWithFile(museum.id, owner.id, '<script>alert("x")</script>', bytesA);
    const b = await photoWithFile(museum.id, owner.id, "صيف الإسكندرية", await makeJpeg(320, 240));
    const scene = await getScene(owner, museum.id);
    const room = scene.rooms.find((r) => r.roomType === "custom")!; // its north wall has no doorway
    const frame = await placeFrame(owner.id, museum.id, { photoId: a.id, roomId: room.id, wallKey: "north", u: 0, v: 1.55, width: 0.8, rotation: 0, style: "white-gallery", options: {} });
    await setCollectionPhotos(owner.id, museum.id, scene.collections[0]!.id, [b.id, a.id]);
    await saveTour(owner.id, museum.id, { name: "Start here", description: "", stops: [{ frameId: frame.id, note: "Our first trip" }] });
    await addComment(owner.id, museum.id, a.id, { body: "Grandpa took this" });
    await signGuestbook(owner.id, museum.id, { body: "Welcome!" });

    const { filename, files, manifest, html } = await unzip(owner.id, museum.id);
    expect(filename).toMatch(/^our-museum-family-album-\d{4}-\d{2}-\d{2}\.zip$/);
    const names = Object.keys(files).sort();
    expect(names).toEqual(["index.html", "museum.json", "photos/001-script-alert-x-script.jpg", "photos/002-صيف-الإسكندرية.jpg"]);
    // Originals byte for byte.
    expect(Buffer.from(files["photos/001-script-alert-x-script.jpg"]!).equals(bytesA)).toBe(true);

    expect(manifest).toMatchObject({
      format: "our-museum-export",
      version: 1,
      museum: { name: "Family <Album>", description: "Summers", owner: owner.displayName },
      photos: [
        { file: "photos/001-script-alert-x-script.jpg", title: '<script>alert("x")</script>', takenAt: "1998-07-14T10:00:00.000Z", comments: [{ body: "Grandpa took this" }] },
        { file: "photos/002-صيف-الإسكندرية.jpg", title: "صيف الإسكندرية" },
      ],
      tours: [{ name: "Start here", stops: [{ photo: "photos/001-script-alert-x-script.jpg", note: "Our first trip" }] }],
      guestbook: [{ body: "Welcome!" }],
    });
    expect(manifest.collections[0].photos).toEqual(["photos/002-صيف-الإسكندرية.jpg", "photos/001-script-alert-x-script.jpg"]);
    expect(manifest.rooms.flatMap((r: { frames: unknown[] }) => r.frames)).toEqual([expect.objectContaining({ photo: "photos/001-script-alert-x-script.jpg", wall: "north", style: "white-gallery" })]);
    expect(manifest.rooms.find((r: { type: string }) => r.type === "custom").frames).toHaveLength(1);
    // No contact details leave with the export.
    expect(JSON.stringify(manifest)).not.toContain("@example.com");

    // The page is inert: escaped text and a CSP without scripts.
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(html).toContain("default-src 'none'; img-src 'self'");
    expect(html).toContain('src="photos/002-صيف-الإسكندرية.jpg"');
    expect(await prisma.museumEvent.count({ where: { eventType: "museum.exported" } })).toBe(1);
  });

  it("writes an Arabic, right-to-left page when exported in Arabic", async () => {
    const owner = await createUser("Owner");
    const museum = await createMuseum(owner, { name: "متحفنا", description: "", templateId: "minimal-white" }, "ar");
    await photoWithFile(museum.id, owner.id, "", await makeJpeg(200, 200));
    const { html, files, filename } = await unzip(owner.id, museum.id, "ar");
    expect(html).toContain('<html lang="ar" dir="rtl">');
    expect(html).toContain("الصور");
    // Untitled photos fall back to their original file name.
    expect(Object.keys(files)).toContain("photos/001-img-0042.jpg");
    expect(filename).toMatch(/^our-museum-متحفنا-/);
  });

  it("still exports when a photo file is missing, and says so", async () => {
    const owner = await createUser("Owner");
    const museum = await createMuseum(owner, { name: "Gaps", description: "", templateId: "minimal-white" }, "en");
    await photoWithFile(museum.id, owner.id, "Here", await makeJpeg(200, 200));
    await photoWithFile(museum.id, owner.id, "Gone", null);
    const { files, manifest, html } = await unzip(owner.id, museum.id);
    expect(Object.keys(files).filter((n) => n.startsWith("photos/"))).toEqual(["photos/001-here.jpg"]);
    expect(manifest.photos.map((p: { file: string | null }) => p.file)).toEqual(["photos/001-here.jpg", null]);
    expect(html).toContain("1 photograph(s) could not be included");
  });

  it("is for the owner only", async () => {
    const owner = await createUser("Owner");
    const museum = await createMuseum(owner, { name: "Mine", description: "", templateId: "minimal-white" }, "en");
    const editor = await createUser("Editor");
    const visitor = await createUser("Visitor");
    const stranger = await createUser("Stranger");
    await addMember(museum.id, editor.id, "EDITOR");
    await addMember(museum.id, visitor.id, "VISITOR");
    await expect(exportMuseum(editor.id, museum.id, "en")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(exportMuseum(visitor.id, museum.id, "en")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(exportMuseum(stranger.id, museum.id, "en")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("makes file-name-safe slugs in any script", () => {
    expect(slugify("Sunset at the beach!", "x")).toBe("sunset-at-the-beach");
    expect(slugify("../../etc/passwd", "x")).toBe("etc-passwd");
    expect(slugify("رحلة ٢٠٢٤", "x")).toBe("رحلة-٢٠٢٤");
    expect(slugify("***", "photo")).toBe("photo");
  });
});
