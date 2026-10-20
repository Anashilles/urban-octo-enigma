import { z } from "zod";

/**
 * Avatar appearance. Avatars are original, procedurally built figures (see
 * src/three/avatars) — no third-party character assets are bundled. The
 * config is stored per user in AvatarProfile.config and validated here on
 * both the server and the client.
 */
export const AVATAR_MODEL_ID = "procedural-v1";

export const BODY_TYPES = ["slim", "average", "broad", "soft"] as const;
export const HAIR_STYLES = ["none", "buzz", "short", "side", "bob", "long", "curly", "afro", "bun", "ponytail"] as const;
export const HEADWEAR = ["none", "cap", "beanie", "beret", "headscarf"] as const;
export const FACIAL_HAIR = ["none", "stubble", "mustache", "goatee", "beard"] as const;
export const GLASSES = ["none", "round", "square", "sun"] as const;
export const TOPS = ["tshirt", "longsleeve", "sweater", "hoodie", "jacket", "dress"] as const;
export const BOTTOMS = ["trousers", "shorts", "skirt"] as const;
export const ACCESSORIES = ["none", "scarf", "necklace", "bag"] as const;

export type BodyType = (typeof BODY_TYPES)[number];
export type HairStyle = (typeof HAIR_STYLES)[number];
export type Headwear = (typeof HEADWEAR)[number];
export type FacialHair = (typeof FACIAL_HAIR)[number];
export type Glasses = (typeof GLASSES)[number];
export type Top = (typeof TOPS)[number];
export type Bottom = (typeof BOTTOMS)[number];
export type Accessory = (typeof ACCESSORIES)[number];

/** Swatches offered in the editor. Any #rrggbb value is accepted. */
export const SKIN_TONES = ["#f7dfcc", "#efcfb6", "#e4bb9b", "#d6a37f", "#c58c65", "#ac7351", "#8f5b3d", "#74462f", "#5a3524", "#40261a"];
export const HAIR_COLORS = ["#1c1714", "#3a2a20", "#5c4030", "#8a5a36", "#b07a45", "#d8b47a", "#a3401f", "#9a9690", "#e9e5dd", "#3d5a8c", "#c96b8f"];
export const EYE_COLORS = ["#3b2416", "#5d3a1f", "#7a5a2e", "#5f7b3a", "#3f6f86", "#6c7a86"];
export const CLOTHING_COLORS = [
  "#f4f1ea",
  "#c9c2b4",
  "#2b2c30",
  "#1f3554",
  "#4d6c8f",
  "#3f6b5c",
  "#7d8c5a",
  "#b9893f",
  "#c7663f",
  "#8f2f35",
  "#c98b95",
  "#6b4e7a",
];
export const ACCENT_COLORS = ["#c9a45c", "#e07a5f", "#81b29a", "#5b8bd9", "#b07fd6", "#e3b23c", "#e0699a", "#4fb3bf"];

const hex = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Expected a #rrggbb colour")
  .transform((s) => s.toLowerCase());

export const avatarConfigSchema = z
  .object({
    bodyType: z.enum(BODY_TYPES),
    /** Uniform height multiplier around an average adult (~1.70 m). */
    height: z
      .number()
      .min(0.92)
      .max(1.08)
      .transform((n) => Math.round(n * 100) / 100),
    skinTone: hex,
    hairStyle: z.enum(HAIR_STYLES),
    hairColor: hex,
    eyeColor: hex,
    facialHair: z.enum(FACIAL_HAIR),
    headwear: z.enum(HEADWEAR),
    headwearColor: hex,
    glasses: z.enum(GLASSES),
    top: z.enum(TOPS),
    topColor: hex,
    bottom: z.enum(BOTTOMS),
    bottomColor: hex,
    shoeColor: hex,
    accessory: z.enum(ACCESSORIES),
    accessoryColor: hex,
    /** Personal colour used for name tags and presence indicators. */
    accent: hex,
  })
  .strict();

export type AvatarConfig = z.output<typeof avatarConfigSchema>;
export type AvatarConfigKey = keyof AvatarConfig;

/** Small deterministic PRNG so the same seed always gives the same avatar. */
export function seededRandom(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rand: () => number, list: readonly T[]): T {
  return list[Math.floor(rand() * list.length) % list.length]!;
}

/** A tasteful random avatar. Pass a seed for a stable result. */
export function randomAvatar(rand: () => number = Math.random): AvatarConfig {
  const hairStyle = pick(rand, HAIR_STYLES.filter((h) => h !== "none" || rand() < 0.3));
  const top = pick(rand, TOPS);
  return {
    bodyType: pick(rand, BODY_TYPES),
    height: Math.round((0.95 + rand() * 0.1) * 100) / 100,
    skinTone: pick(rand, SKIN_TONES),
    hairStyle,
    hairColor: pick(rand, HAIR_COLORS.slice(0, 9)),
    eyeColor: pick(rand, EYE_COLORS),
    facialHair: rand() < 0.65 ? "none" : pick(rand, FACIAL_HAIR),
    headwear: rand() < 0.75 ? "none" : pick(rand, HEADWEAR),
    headwearColor: pick(rand, CLOTHING_COLORS),
    glasses: rand() < 0.65 ? "none" : pick(rand, GLASSES),
    top,
    topColor: pick(rand, CLOTHING_COLORS),
    bottom: pick(rand, BOTTOMS),
    bottomColor: pick(rand, CLOTHING_COLORS.slice(1, 8)),
    shoeColor: pick(rand, ["#2b2c30", "#f4f1ea", "#5c4030", "#8a5a36", "#1f3554"]),
    accessory: rand() < 0.6 ? "none" : pick(rand, ACCESSORIES),
    accessoryColor: pick(rand, CLOTHING_COLORS),
    accent: pick(rand, ACCENT_COLORS),
  };
}

/** The avatar a user gets before customising: stable per user. */
export function defaultAvatar(seed: string): AvatarConfig {
  // A calm starting point; "Surprise me" in the editor explores everything.
  return { ...randomAvatar(seededRandom(`avatar:${seed}`)), facialHair: "none", headwear: "none", glasses: "none", accessory: "none" };
}

/**
 * Reads a stored config leniently: each valid field is kept, missing or
 * invalid ones (e.g. from an older version) fall back to the seeded default.
 */
export function normalizeAvatarConfig(raw: unknown, seed: string): AvatarConfig {
  const base = defaultAvatar(seed);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  const shape = avatarConfigSchema.shape;
  const out: Record<string, unknown> = { ...base };
  for (const key of Object.keys(shape) as AvatarConfigKey[]) {
    const parsed = shape[key].safeParse((raw as Record<string, unknown>)[key]);
    if (parsed.success) out[key] = parsed.data;
  }
  return out as AvatarConfig;
}

export function sameAvatar(a: AvatarConfig, b: AvatarConfig): boolean {
  return (Object.keys(avatarConfigSchema.shape) as AvatarConfigKey[]).every((k) => a[k] === b[k]);
}
