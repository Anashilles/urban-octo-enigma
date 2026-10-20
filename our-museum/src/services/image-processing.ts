import "server-only";
import sharp, { type Metadata } from "sharp";
import { errors } from "@/lib/errors";

export { ACCEPTED_MIME_TYPES } from "./image-processing-types";

export type DetectedFormat = "jpeg" | "png" | "webp" | "heic";

/**
 * Identifies the real file type from its leading bytes. The declared MIME type
 * and file extension are never trusted.
 */
export function detectFormat(buf: Buffer): DetectedFormat | null {
  if (buf.length < 16) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "webp";
  // ISO-BMFF: size(4) "ftyp" brand(4) … compatible brands
  if (buf.toString("ascii", 4, 8) === "ftyp") {
    const boxSize = Math.min(buf.readUInt32BE(0), 64);
    const brands = new Set<string>();
    for (let o = 8; o + 4 <= boxSize; o += 4) brands.add(buf.toString("ascii", o, o + 4));
    if (["heic", "heix", "hevc", "hevx", "heim", "heis"].some((b) => brands.has(b))) return "heic";
    if (brands.has("mif1") && !brands.has("avif")) return "heic";
  }
  return null;
}

export interface ImageVariant {
  buffer: Buffer;
  contentType: string;
  ext: string;
  width: number;
  height: number;
}

export interface ProcessedImage {
  original: ImageVariant;
  large: ImageVariant;
  medium: ImageVariant;
  thumb: ImageVariant;
  width: number;
  height: number;
  dominantColor: string;
  sourceFormat: DetectedFormat;
}

const MAX_DIMENSION = 12_000;
const MIN_DIMENSION = 32;
const ORIGINAL_MAX_SIDE = 6000;

async function convertHeic(input: Buffer): Promise<Buffer> {
  // heic-convert decodes HEIC with a WebAssembly build of libheif (no native codecs needed).
  const { default: convert } = await import("heic-convert");
  const out = await convert({ buffer: input, format: "JPEG", quality: 0.95 });
  return Buffer.from(out);
}

function toHex(n: number) {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
}

/**
 * Decodes and re-encodes an uploaded photo. Re-encoding guarantees the stored
 * files are real images, applies the EXIF orientation, converts to sRGB and
 * strips every other piece of metadata (including GPS location).
 */
export async function processImage(input: Buffer): Promise<ProcessedImage> {
  const format = detectFormat(input);
  if (!format) throw errors.unsupported("This file is not a supported image. Use JPEG, PNG, WebP or HEIC.");
  let source = input;
  if (format === "heic") {
    try {
      source = await convertHeic(input);
    } catch {
      throw errors.unsupported("This HEIC photo could not be converted.");
    }
  }

  let meta: Metadata;
  try {
    meta = await sharp(source, { failOn: "error", limitInputPixels: 100_000_000 }).metadata();
  } catch {
    throw errors.unsupported("This image could not be read. It may be damaged.");
  }
  if (!meta.width || !meta.height) throw errors.unsupported("This image has no readable dimensions.");
  if (meta.width > MAX_DIMENSION || meta.height > MAX_DIMENSION) throw errors.validation("This image is too large in pixel dimensions.");
  if (meta.width < MIN_DIMENSION || meta.height < MIN_DIMENSION) throw errors.validation("This image is too small.");

  const keepAlpha = format === "png" && Boolean(meta.hasAlpha);

  const base = () => sharp(source, { failOn: "error", limitInputPixels: 100_000_000 }).rotate().withIccProfile("srgb");

  const originalPipeline = base().resize({ width: ORIGINAL_MAX_SIDE, height: ORIGINAL_MAX_SIDE, fit: "inside", withoutEnlargement: true });
  const originalOut = keepAlpha
    ? await originalPipeline.png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true })
    : await originalPipeline.flatten({ background: "#ffffff" }).jpeg({ quality: 90, mozjpeg: true }).toBuffer({ resolveWithObject: true });

  const derive = async (side: number, quality: number): Promise<ImageVariant> => {
    const { data, info } = await base()
      .resize({ width: side, height: side, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .webp({ quality, effort: 4 })
      .toBuffer({ resolveWithObject: true });
    return { buffer: data, contentType: "image/webp", ext: "webp", width: info.width, height: info.height };
  };
  const [large, medium, thumb] = await Promise.all([derive(2048, 84), derive(1024, 82), derive(480, 78)]);
  const stats = await sharp(thumb.buffer).stats();
  const d = stats.dominant;

  return {
    original: {
      buffer: originalOut.data,
      contentType: keepAlpha ? "image/png" : "image/jpeg",
      ext: keepAlpha ? "png" : "jpg",
      width: originalOut.info.width,
      height: originalOut.info.height,
    },
    large,
    medium,
    thumb,
    // Dimensions after EXIF rotation, so the frame keeps the photo's true aspect ratio.
    width: originalOut.info.width,
    height: originalOut.info.height,
    dominantColor: `#${toHex(d.r)}${toHex(d.g)}${toHex(d.b)}`,
    sourceFormat: format,
  };
}
