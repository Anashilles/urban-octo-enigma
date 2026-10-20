import { rm } from "node:fs/promises";
import sharp from "sharp";
import { prisma } from "@/lib/database/prisma";

let seq = 0;

export async function resetDatabase() {
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
  await rm("./.data/test-storage", { recursive: true, force: true });
}

export async function createUser(name = "User", opts: { emailVerified?: boolean; isAnonymous?: boolean; email?: string } = {}) {
  seq++;
  const id = `user_${Date.now().toString(36)}_${seq}`;
  const emailVerified = opts.emailVerified ?? !opts.isAnonymous;
  const isAnonymous = opts.isAnonymous ?? false;
  const user = await prisma.user.create({
    data: { id, displayName: `${name} ${seq}`, email: opts.email ?? `${id}@example.com`, emailVerified, isAnonymous },
  });
  return { id: user.id, displayName: user.displayName, email: user.email, isAnonymous, emailVerified };
}

export async function addMember(museumId: string, userId: string, role: "EDITOR" | "VISITOR") {
  await prisma.museumMembership.create({ data: { museumId, userId, role } });
}

/** A real JPEG with optional EXIF orientation and GPS metadata. */
export async function makeJpeg(width = 640, height = 480, opts: { orientation?: number; gps?: boolean } = {}) {
  let img = sharp({ create: { width, height, channels: 3, background: { r: 180, g: 120, b: 90 } } }).jpeg({ quality: 85 });
  if (opts.orientation) img = img.withMetadata({ orientation: opts.orientation });
  if (opts.gps) {
    img = img.withExif({
      IFD0: { Make: "TestCam" },
      IFD3: { GPSLatitudeRef: "N", GPSLatitude: "48/1 51/1 2460/100", GPSLongitudeRef: "E", GPSLongitude: "2/1 21/1 900/100" },
    });
  }
  return img.toBuffer();
}

export async function makePng(width = 300, height = 300, alpha = true) {
  return sharp({ create: { width, height, channels: alpha ? 4 : 3, background: { r: 10, g: 120, b: 200, alpha: 0.5 } } })
    .png()
    .toBuffer();
}
