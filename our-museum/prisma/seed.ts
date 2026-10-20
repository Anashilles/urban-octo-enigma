/**
 * Development seed: a demo account with a sample museum.
 *
 *   npm run db:seed
 *
 * Every image is generated here from simple shapes (no real photographs) and
 * goes through the same processing pipeline and storage as real uploads.
 * Credentials: SEED_EMAIL / SEED_PASSWORD, or a random password that is
 * printed once. Running it again leaves an existing demo account untouched.
 */
import { randomBytes, randomUUID } from "node:crypto";
import sharp from "sharp";
import { hashPassword } from "better-auth/crypto";
import { randomAvatar, seededRandom } from "@/features/avatars/config";
import { defaultPrintWidth, findFreeSpot, sizeForAspect } from "@/features/photo-placement/placement";
import { computeWallSpec, WALL_KEYS } from "@/features/rooms/geometry";
import { prisma } from "@/lib/database/prisma";
import { saveAvatar } from "@/services/avatar-service";
import { processImage } from "@/services/image-processing";
import { createMuseum } from "@/services/museum-service";
import { placeFrame } from "@/services/photo-placement-service";
import { getScene } from "@/services/scene-service";
import { photoKeys, storage } from "@/services/storage";
import { saveTour } from "@/services/tour-service";

const EMAIL = (process.env.SEED_EMAIL ?? "demo@ourmuseum.local").toLowerCase();

interface Artwork {
  title: string;
  caption: string;
  width: number;
  height: number;
  svg: (w: number, h: number) => string;
}

const hills = (w: number, h: number, y: number, amp: number, color: string, seed: number) => {
  let d = `M0 ${h} L0 ${y}`;
  for (let x = 0; x <= w; x += w / 24) d += ` L${x.toFixed(0)} ${(y + Math.sin(x / (w / 5) + seed) * amp + Math.sin(x / (w / 13) + seed * 2) * amp * 0.4).toFixed(0)}`;
  return `<path d="${d} L${w} ${h} Z" fill="${color}"/>`;
};

const ARTWORKS: Artwork[] = [
  {
    title: "Mountain morning",
    caption: "Generated sample — soft light over the hills.",
    width: 1600,
    height: 1067,
    svg: (w, h) =>
      `<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fb3d9"/><stop offset="1" stop-color="#f3d9b5"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#s)"/><circle cx="${w * 0.3}" cy="${h * 0.35}" r="${h * 0.07}" fill="#fff2d6"/>${hills(w, h, h * 0.6, h * 0.06, "#7d93ad", 1)}${hills(w, h, h * 0.72, h * 0.05, "#4f6b5c", 2)}${hills(w, h, h * 0.85, h * 0.04, "#2f4a3c", 3)}`,
  },
  {
    title: "Coastal light",
    caption: "Generated sample — a calm horizon.",
    width: 1500,
    height: 1500,
    svg: (w, h) =>
      `<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfe3ec"/><stop offset="0.55" stop-color="#eef4f2"/><stop offset="0.56" stop-color="#4f8aa0"/><stop offset="1" stop-color="#1f4a5f"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#s)"/>${Array.from({ length: 18 }, (_, i) => `<rect x="${(i * 97) % w}" y="${h * 0.6 + i * 28}" width="${120 + (i % 4) * 30}" height="3" fill="#cfe3ec" opacity="0.5"/>`).join("")}`,
  },
  {
    title: "Evening glow",
    caption: "Generated sample — warm colours at dusk.",
    width: 1200,
    height: 1600,
    svg: (w, h) =>
      `<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b2d5c"/><stop offset="0.5" stop-color="#e0796b"/><stop offset="1" stop-color="#f6c58a"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#s)"/><circle cx="${w * 0.5}" cy="${h * 0.62}" r="${w * 0.14}" fill="#ffe3b0"/>${hills(w, h, h * 0.75, h * 0.03, "#2b2140", 4)}`,
  },
  {
    title: "Garden path",
    caption: "Generated sample — a quiet walk.",
    width: 1600,
    height: 1200,
    svg: (w, h) =>
      `<rect width="${w}" height="${h}" fill="#dfe9d2"/>${Array.from({ length: 40 }, (_, i) => `<circle cx="${(i * 173) % w}" cy="${(i * 97) % (h * 0.6)}" r="${40 + (i % 5) * 18}" fill="${["#7fa36b", "#5c8a58", "#a8c48c", "#d98fa0"][i % 4]}" opacity="0.8"/>`).join("")}<path d="M${w * 0.42} ${h} L${w * 0.5} ${h * 0.55} L${w * 0.58} ${h} Z" fill="#c9b28a"/>`,
  },
  {
    title: "Night sky",
    caption: "Generated sample — stars above the city.",
    width: 1600,
    height: 1000,
    svg: (w, h) =>
      `<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1330"/><stop offset="1" stop-color="#2a3a6b"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#s)"/>${Array.from({ length: 140 }, (_, i) => `<circle cx="${(i * 211) % w}" cy="${(i * 137) % (h * 0.7)}" r="${1 + (i % 3)}" fill="#fff" opacity="${0.4 + (i % 5) * 0.12}"/>`).join("")}${Array.from({ length: 16 }, (_, i) => `<rect x="${i * (w / 16)}" y="${h * (0.62 + ((i * 7) % 5) * 0.05)}" width="${w / 16 - 6}" height="${h}" fill="#141a2e"/>`).join("")}`,
  },
  {
    title: "Colour field",
    caption: "Generated sample — blocks of colour.",
    width: 1400,
    height: 1400,
    svg: (w, h) =>
      `<rect width="${w}" height="${h}" fill="#efe6d8"/><rect x="${w * 0.1}" y="${h * 0.1}" width="${w * 0.8}" height="${h * 0.35}" fill="#c7663f"/><rect x="${w * 0.1}" y="${h * 0.5}" width="${w * 0.8}" height="${h * 0.12}" fill="#e3b23c"/><rect x="${w * 0.1}" y="${h * 0.66}" width="${w * 0.8}" height="${h * 0.24}" fill="#1f3554"/>`,
  },
  {
    title: "Desert dunes",
    caption: "Generated sample — wind-shaped sand.",
    width: 1600,
    height: 900,
    svg: (w, h) =>
      `<rect width="${w}" height="${h}" fill="#f4dcb0"/>${hills(w, h, h * 0.45, h * 0.08, "#e7b77a", 5)}${hills(w, h, h * 0.6, h * 0.07, "#d79b5c", 6)}${hills(w, h, h * 0.78, h * 0.05, "#b97a42", 7)}`,
  },
  {
    title: "City at dusk",
    caption: "Generated sample — lights coming on.",
    width: 1200,
    height: 1500,
    svg: (w, h) =>
      `<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9a07a"/><stop offset="1" stop-color="#5a4a78"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#s)"/>${Array.from({ length: 9 }, (_, i) => {
        const bw = w / 9;
        const bh = h * (0.3 + ((i * 5) % 7) * 0.06);
        const windows = Array.from({ length: 12 }, (_, j) => `<rect x="${i * bw + 10 + (j % 3) * (bw / 3.4)}" y="${h - bh + 20 + Math.floor(j / 3) * 40}" width="${bw / 6}" height="16" fill="#ffd98a" opacity="${(i + j) % 3 ? 0.85 : 0.2}"/>`).join("");
        return `<rect x="${i * bw}" y="${h - bh}" width="${bw - 4}" height="${bh}" fill="#2c2440"/>${windows}`;
      }).join("")}`,
  },
];

async function render(art: Artwork): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${art.width}" height="${art.height}" viewBox="0 0 ${art.width} ${art.height}">${art.svg(art.width, art.height)}</svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
}

async function main() {
  const existing = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (existing) {
    console.log(`Seed: ${EMAIL} already exists — nothing to do.`);
    return;
  }
  const password = process.env.SEED_PASSWORD ?? randomBytes(9).toString("base64url");
  const userId = randomUUID().replace(/-/g, "");
  const user = await prisma.user.create({ data: { id: userId, email: EMAIL, displayName: "Demo", emailVerified: true, locale: "en" } });
  await prisma.account.create({ data: { id: randomUUID().replace(/-/g, ""), accountId: userId, providerId: "credential", userId, password: await hashPassword(password) } });
  await saveAvatar(user.id, randomAvatar(seededRandom("seed-demo")));

  const museum = await createMuseum({ id: user.id, isAnonymous: false }, { name: "Sample Museum", description: "Generated sample artwork — replace it with your own photographs.", templateId: "warm-romantic" }, "en");

  const photoIds: string[] = [];
  for (const art of ARTWORKS) {
    const processed = await processImage(await render(art));
    const id = randomUUID().replace(/-/g, "").slice(0, 24);
    const keys = photoKeys(museum.id, id, processed.original.ext);
    const s = storage();
    await s.put(keys.storageKey, processed.original.buffer, processed.original.contentType);
    await s.put(keys.largeKey, processed.large.buffer, processed.large.contentType);
    await s.put(keys.mediumKey, processed.medium.buffer, processed.medium.contentType);
    await s.put(keys.thumbnailKey, processed.thumb.buffer, processed.thumb.contentType);
    await prisma.photo.create({
      data: {
        id,
        museumId: museum.id,
        uploadedById: user.id,
        ...keys,
        originalFilename: `${art.title.toLowerCase().replace(/\s+/g, "-")}.jpg`,
        mimeType: processed.original.contentType,
        width: processed.width,
        height: processed.height,
        sizeBytes: processed.original.buffer.length,
        dominantColor: processed.dominantColor,
        title: art.title,
        caption: art.caption,
      },
    });
    photoIds.push(id);
  }

  // Hang them: two per wall, walking through the rooms in order.
  const sessionUser = { id: user.id, displayName: user.displayName, isAnonymous: false };
  let scene = await getScene(sessionUser, museum.id);
  const rooms = [...scene.rooms].sort((a, b) => a.sortOrder - b.sortOrder);
  const frameIds: string[] = [];
  let next = 0;
  outer: for (const room of rooms) {
    for (const wallKey of WALL_KEYS) {
      for (let k = 0; k < 2; k++) {
        if (next >= photoIds.length) break outer;
        const photo = scene.photos.find((p) => p.id === photoIds[next])!;
        const spec = computeWallSpec(room, wallKey);
        const aspect = photo.width / photo.height;
        const size = sizeForAspect(aspect, defaultPrintWidth(aspect, room.height), Math.min(1.9, room.height - 1.3));
        const others = scene.frames
          .filter((f) => f.roomId === room.id && f.wallKey === wallKey)
          .map((f) => ({ id: f.id, u: f.u, v: f.v, width: f.width, height: f.height, rotation: f.rotation, style: f.style, options: f.options }));
        const spot = findFreeSpot(spec.bounds, { ...size, style: scene.theme.defaultFrameStyle, options: { showPlaque: true } }, others);
        if (!spot) break;
        const frame = await placeFrame(user.id, museum.id, { photoId: photo.id, roomId: room.id, wallKey, u: spot.u, v: spot.v, width: spot.width, rotation: 0, style: scene.theme.defaultFrameStyle, options: { showPlaque: true } });
        frameIds.push(frame.id);
        next++;
        scene = await getScene(sessionUser, museum.id);
      }
    }
  }

  await saveTour(user.id, museum.id, {
    name: "A first walk",
    description: "Four stops through the sample museum.",
    stops: frameIds.slice(0, 4).map((frameId, i) => ({ frameId, note: ["Every museum starts with one photograph.", "Add a note to each stop of a tour.", "Lead the tour and everyone walks with you.", "Now hang your own photographs."][i] ?? "" })),
  });

  console.log("Seed complete.");
  console.log(`  Sign in as: ${EMAIL}`);
  if (!process.env.SEED_PASSWORD) console.log(`  Password (shown once): ${password}`);
  console.log(`  Museum: /museum/${museum.id}  (${frameIds.length} framed sample images)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
