import "server-only";
import { Zip, ZipDeflate, ZipPassThrough, strToU8 } from "fflate";
import type { Locale } from "@/i18n/config";
import { translatorFor } from "@/i18n/server";
import { prisma } from "@/lib/database/prisma";
import { logger } from "@/lib/logger";
import { requireMuseumAccess } from "./access";
import { recordEvent } from "./audit-service";
import { storage } from "./storage";

/**
 * Owner's copy of a museum as a ZIP: the sanitised originals, museum.json
 * (rooms, frames, collections, tours, comments, guestbook) and index.html, an
 * offline gallery with no scripts. Files are read and zipped one at a time as
 * the download is consumed, so memory stays bounded.
 */

export const EXPORT_FORMAT = "our-museum-export";
export const EXPORT_VERSION = 1;

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** File-name-safe slug that keeps letters in any script. */
export function slugify(value: string, fallback: string) {
  const slug = value
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .toLowerCase();
  return slug || fallback;
}

async function loadMuseum(museumId: string) {
  const [museum, rooms, frames, photos, collections, tours, comments, guestbook] = await Promise.all([
    prisma.museum.findUniqueOrThrow({ where: { id: museumId }, include: { owner: { select: { displayName: true } } } }),
    prisma.museumRoom.findMany({ where: { museumId }, orderBy: { sortOrder: "asc" } }),
    prisma.photoFrame.findMany({ where: { museumId }, orderBy: { createdAt: "asc" }, include: { wall: { select: { wallKey: true } } } }),
    prisma.photo.findMany({ where: { museumId }, orderBy: { createdAt: "asc" } }),
    prisma.photoCollection.findMany({ where: { museumId }, orderBy: { sortOrder: "asc" }, include: { photos: { orderBy: { sortOrder: "asc" }, select: { photoId: true } } } }),
    prisma.guidedTour.findMany({ where: { museumId }, orderBy: { createdAt: "asc" }, include: { stops: { orderBy: { sortOrder: "asc" } } } }),
    prisma.photoComment.findMany({ where: { museumId }, orderBy: { createdAt: "asc" }, include: { author: { select: { displayName: true } } } }),
    prisma.guestbookEntry.findMany({ where: { museumId }, orderBy: { createdAt: "asc" }, include: { author: { select: { displayName: true } } } }),
  ]);
  return { museum, rooms, frames, photos, collections, tours, comments, guestbook };
}

type Loaded = Awaited<ReturnType<typeof loadMuseum>>;

function buildManifest(data: Loaded, fileOf: Map<string, string>, missing: Set<string>, exportedAt: Date) {
  const { museum, rooms, frames, photos, collections, tours, comments, guestbook } = data;
  const frameById = new Map(frames.map((f) => [f.id, f]));
  const photoFile = (photoId: string) => (missing.has(photoId) ? null : (fileOf.get(photoId) ?? null));
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: exportedAt.toISOString(),
    museum: {
      name: museum.name,
      description: museum.description,
      owner: museum.owner.displayName,
      template: museum.templateId,
      theme: museum.theme,
      createdAt: museum.createdAt.toISOString(),
    },
    photos: photos.map((p) => ({
      file: photoFile(p.id),
      title: p.title,
      caption: p.caption,
      takenAt: p.takenAt?.toISOString() ?? null,
      width: p.width,
      height: p.height,
      originalFilename: p.originalFilename,
      addedAt: p.createdAt.toISOString(),
      comments: comments.filter((c) => c.photoId === p.id).map((c) => ({ author: c.author.displayName, body: c.body, at: c.createdAt.toISOString() })),
    })),
    rooms: rooms.map((r) => ({
      name: r.name,
      type: r.roomType,
      size: { width: r.width, depth: r.depth, height: r.height },
      frames: frames
        .filter((f) => f.roomId === r.id)
        .map((f) => ({
          photo: photoFile(f.photoId),
          wall: f.wall.wallKey,
          position: { u: f.positionU, v: f.positionV },
          size: { width: f.width, height: f.height },
          rotation: f.rotation,
          style: f.frameStyle,
          options: f.frameOptions,
          caption: f.caption,
        })),
    })),
    collections: collections.map((c) => ({ name: c.name, description: c.description, photos: c.photos.map((p) => photoFile(p.photoId)).filter(Boolean) })),
    tours: tours.map((t) => ({
      name: t.name,
      description: t.description,
      stops: t.stops.map((s) => ({ photo: photoFile(frameById.get(s.frameId)?.photoId ?? ""), note: s.note })),
    })),
    guestbook: guestbook.map((g) => ({ author: g.author.displayName, body: g.body, at: g.createdAt.toISOString() })),
  };
}

type Manifest = ReturnType<typeof buildManifest>;

function buildIndexHtml(m: Manifest, locale: Locale, missingCount: number) {
  const t = translatorFor(locale);
  const dir = locale === "ar" ? "rtl" : "ltr";
  const date = (iso: string) => new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(new Date(iso));
  const e = escapeHtml;
  const notes = (list: Array<{ author: string; body: string; at: string }>) =>
    list.map((n) => `<li><p>${e(n.body)}</p><small>${e(n.author)} · ${e(date(n.at))}</small></li>`).join("");
  const figure = (p: Manifest["photos"][number]) =>
    p.file
      ? `<figure id="${e(p.file)}"><a href="${e(p.file)}"><img src="${e(p.file)}" alt="${e(p.title)}" loading="lazy" width="${p.width}" height="${p.height}"></a><figcaption><strong>${e(p.title || p.originalFilename)}</strong>${p.caption ? `<span>${e(p.caption)}</span>` : ""}${p.takenAt ? `<small>${e(t("export.takenOn", { date: date(p.takenAt) }))}</small>` : ""}</figcaption>${p.comments.length ? `<details><summary>${e(t("export.comments"))} (${p.comments.length})</summary><ul class="notes">${notes(p.comments)}</ul></details>` : ""}</figure>`
      : "";
  const title = t("export.title", { museum: m.museum.name });
  return `<!doctype html>
<html lang="${locale}" dir="${dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self'; style-src 'unsafe-inline'">
<title>${e(title)}</title>
<style>
:root{color-scheme:light;--ink:#242321;--muted:#66625a;--paper:#f5f2ec;--card:#fbf9f5;--gold:#7f622d}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.6 system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif}
main{max-width:72rem;margin:0 auto;padding:2.5rem 1rem 4rem}h1{font:500 2.4rem/1.15 Georgia,serif;margin:.2rem 0 .5rem}h2{font:500 1.6rem Georgia,serif;margin:2.5rem 0 1rem;border-bottom:1px solid #e2dbcf;padding-bottom:.4rem}
.eyebrow{color:var(--gold);letter-spacing:.15em;text-transform:uppercase;font-size:.75rem;margin:0}.muted{color:var(--muted)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(15rem,1fr));gap:1rem}
figure{margin:0;background:var(--card);border:1px solid #e2dbcf;border-radius:.8rem;overflow:hidden}figure img{display:block;width:100%;height:auto;background:#e8e2d8}
figcaption{display:grid;gap:.15rem;padding:.7rem .85rem}figcaption span,small{color:var(--muted);font-size:.9rem}
details{padding:0 .85rem .7rem}summary{cursor:pointer;color:var(--gold);font-size:.9rem}
ul.notes{list-style:none;padding:0;margin:.5rem 0 0;display:grid;gap:.5rem}ul.notes li{background:#fff;border:1px solid #e2dbcf;border-radius:.6rem;padding:.5rem .7rem}ul.notes p{margin:0 0 .2rem;white-space:pre-line}
ol.stops{padding-inline-start:1.4rem}ol.stops li{margin:.3rem 0}a{color:var(--gold)}.note{white-space:pre-line}
</style>
</head>
<body>
<main>
<p class="eyebrow">Our Museum</p>
<h1>${e(m.museum.name)}</h1>
${m.museum.description ? `<p>${e(m.museum.description)}</p>` : ""}
<p class="muted">${e(t("export.exportedOn", { date: date(m.exportedAt) }))}</p>
<p class="muted">${e(t("export.intro"))}</p>
${missingCount ? `<p role="note">${e(t("export.missing", { count: missingCount }))}</p>` : ""}
${m.collections
  .filter((c) => c.photos.length)
  .map((c) => `<section><h2>${e(c.name)}</h2>${c.description ? `<p class="muted">${e(c.description)}</p>` : ""}<div class="grid">${c.photos.map((f) => figure(m.photos.find((p) => p.file === f)!)).join("")}</div></section>`)
  .join("\n")}
<section><h2>${e(t("export.photos"))}</h2><div class="grid">${m.photos.map(figure).join("")}</div></section>
${m.tours.length ? `<section><h2>${e(t("export.tours"))}</h2>${m.tours.map((tour) => `<h3>${e(tour.name)}</h3>${tour.description ? `<p class="muted">${e(tour.description)}</p>` : ""}<ol class="stops">${tour.stops.map((s) => `<li>${s.photo ? `<a href="#${e(s.photo)}">${e(m.photos.find((p) => p.file === s.photo)?.title || s.photo)}</a>` : ""}${s.note ? ` — <span class="note">${e(s.note)}</span>` : ""}</li>`).join("")}</ol>`).join("")}</section>` : ""}
${m.guestbook.length ? `<section><h2>${e(t("export.guestbook"))}</h2><ul class="notes">${notes(m.guestbook)}</ul></section>` : ""}
</main>
</body>
</html>
`;
}

export async function exportMuseum(userId: string, museumId: string, locale: Locale) {
  await requireMuseumAccess(userId, museumId, "museum.export");
  const data = await loadMuseum(museumId);
  const exportedAt = new Date();

  // Stable, readable file names: 001-sunset-at-the-beach.jpg
  const fileOf = new Map<string, string>();
  data.photos.forEach((p, i) => {
    const ext = p.storageKey.split(".").pop() ?? "jpg";
    const base = p.title || p.originalFilename.replace(/\.[^.]+$/, "");
    fileOf.set(p.id, `photos/${String(i + 1).padStart(3, "0")}-${slugify(base, "photo")}.${ext}`);
  });
  const missing = new Set<string>();

  type Entry = { name: string; compress: boolean; read: () => Promise<Uint8Array | null> };
  const entries: Entry[] = [
    ...data.photos.map(
      (p): Entry => ({
        name: fileOf.get(p.id)!,
        compress: false, // JPEG/PNG are already compressed
        read: async () => {
          try {
            return new Uint8Array(await storage().get(p.storageKey));
          } catch (error) {
            missing.add(p.id);
            logger.warn("export_photo_missing", { museumId, photoId: p.id, error: error instanceof Error ? error.message : String(error) });
            return null;
          }
        },
      }),
    ),
    // Written last, so they reflect any photo that could not be read.
    { name: "museum.json", compress: true, read: async () => strToU8(JSON.stringify(buildManifest(data, fileOf, missing, exportedAt), null, 2)) },
    { name: "index.html", compress: true, read: async () => strToU8(buildIndexHtml(buildManifest(data, fileOf, missing, exportedAt), locale, missing.size)) },
  ];

  let zip: Zip;
  let next = 0;
  const stream = new ReadableStream<Uint8Array>(
    {
      start(controller) {
        zip = new Zip((error, chunk, final) => {
          if (error) return controller.error(error);
          controller.enqueue(chunk);
          if (final) controller.close();
        });
      },
      async pull() {
        if (next === entries.length) {
          next++;
          zip.end();
          return;
        }
        if (next > entries.length) return;
        const entry = entries[next++]!;
        const bytes = await entry.read();
        if (!bytes) return;
        const file = entry.compress ? new ZipDeflate(entry.name, { level: 6 }) : new ZipPassThrough(entry.name);
        file.mtime = exportedAt;
        zip.add(file);
        file.push(bytes, true);
      },
      cancel() {
        zip.terminate();
      },
    },
    { highWaterMark: 1 },
  );

  await recordEvent({ museumId, actorId: userId, eventType: "museum.exported", metadata: { photos: data.photos.length } });
  const date = exportedAt.toISOString().slice(0, 10);
  return { stream, filename: `our-museum-${slugify(data.museum.name, "museum")}-${date}.zip` };
}
