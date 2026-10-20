import { z } from "zod";
import { FLOOR_MATERIALS, LIGHTING_PRESETS, type FloorMaterial, type LightingPreset } from "@/features/rooms/geometry";
import { FRAME_STYLES, type FrameStyle } from "@/features/photo-placement/placement";

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

/** User-editable theme overrides stored in Museum.theme. */
export const themeOverridesSchema = z.object({
  wallColor: hexColor.optional(),
  floorMaterial: z.enum(FLOOR_MATERIALS).optional(),
  lightingPreset: z.enum(LIGHTING_PRESETS).optional(),
  defaultFrameStyle: z.enum(FRAME_STYLES).optional(),
});
export type ThemeOverrides = z.infer<typeof themeOverridesSchema>;

export interface ResolvedTheme {
  wallColor: string;
  accentWallColor: string;
  trimColor: string;
  /** Polished brass/gold trim (rendered metallic). */
  trimMetallic: boolean;
  ceilingColor: string;
  floorMaterial: FloorMaterial;
  lightingPreset: LightingPreset;
  defaultFrameStyle: FrameStyle;
  defaultMatColor: string;
  wainscot: boolean;
  crownMolding: boolean;
  baseboard: "none" | "thin" | "tall";
  ceilingStyle: "flat" | "coffered" | "skylights" | "tracks";
  plasterTexture: boolean;
}

export interface LightingSpec {
  lightColor: string;
  hemisphereSky: string;
  hemisphereGround: string;
  ambient: number;
  hemisphere: number;
  roomLight: number;
  wash: number;
  exposure: number;
  /** Multiplier applied to photo colours so they sit in the room's light. */
  photoBrightness: number;
  background: string;
}

export const LIGHTING_SPECS: Record<LightingPreset, LightingSpec> = {
  gallery: { lightColor: "#fff6ea", hemisphereSky: "#ffffff", hemisphereGround: "#d9d1c3", ambient: 0.55, hemisphere: 0.75, roomLight: 14, wash: 0.16, exposure: 1.0, photoBrightness: 1.0, background: "#f2efe9" },
  warm: { lightColor: "#ffd59a", hemisphereSky: "#fff1dc", hemisphereGround: "#a88c6a", ambient: 0.42, hemisphere: 0.6, roomLight: 16, wash: 0.28, exposure: 0.98, photoBrightness: 0.97, background: "#efe4d3" },
  cool: { lightColor: "#f1f5ff", hemisphereSky: "#f4f7ff", hemisphereGround: "#c9ccd1", ambient: 0.6, hemisphere: 0.7, roomLight: 13, wash: 0.14, exposure: 1.0, photoBrightness: 1.0, background: "#eceef1" },
  dramatic: { lightColor: "#ffd9a6", hemisphereSky: "#6b6560", hemisphereGround: "#1a1816", ambient: 0.16, hemisphere: 0.32, roomLight: 10, wash: 0.5, exposure: 1.05, photoBrightness: 0.96, background: "#151413" },
  soft: { lightColor: "#fff3e3", hemisphereSky: "#fffaf3", hemisphereGround: "#e3d9c9", ambient: 0.7, hemisphere: 0.65, roomLight: 9, wash: 0.12, exposure: 0.97, photoBrightness: 0.98, background: "#f5f1ea" },
};

export function resolveTheme(base: ResolvedTheme, overrides: unknown): ResolvedTheme {
  const parsed = themeOverridesSchema.safeParse(overrides ?? {});
  const o = parsed.success ? parsed.data : {};
  return {
    ...base,
    ...(o.wallColor ? { wallColor: o.wallColor } : {}),
    ...(o.floorMaterial ? { floorMaterial: o.floorMaterial } : {}),
    ...(o.lightingPreset ? { lightingPreset: o.lightingPreset } : {}),
    ...(o.defaultFrameStyle ? { defaultFrameStyle: o.defaultFrameStyle } : {}),
  };
}

/** Museum privacy configuration stored in Museum.privacy. */
export const privacySchema = z.object({
  /** Whether visitors (not just owner/editors) may start a "Look Together" session. */
  guestsCanStartSharedViewing: z.boolean().default(true),
  /** Whether invitations may admit guests who only provide a display name. */
  allowAnonymousGuests: z.boolean().default(true),
  voiceChatEnabled: z.boolean().default(true),
  reactionsEnabled: z.boolean().default(true),
});
export type PrivacyConfig = z.infer<typeof privacySchema>;

export function resolvePrivacy(value: unknown): PrivacyConfig {
  const parsed = privacySchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : privacySchema.parse({});
}
