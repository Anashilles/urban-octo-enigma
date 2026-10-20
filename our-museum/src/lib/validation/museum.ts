import { z } from "zod";
import { TEMPLATE_IDS } from "@/features/museums/templates";
import { privacySchema, themeOverridesSchema } from "@/features/museums/theme";
import { DECOR_TYPES, FLOOR_MATERIALS, LIGHTING_PRESETS, ROOM_TYPES } from "@/features/rooms/geometry";

const name = z.string().trim().min(1).max(80);
const id = z.string().min(8).max(64);
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const createMuseumSchema = z.object({
  name,
  description: z.string().trim().max(500).default(""),
  templateId: z.enum(TEMPLATE_IDS),
});

export const updateMuseumSchema = z
  .object({
    name: name.optional(),
    description: z.string().trim().max(500).optional(),
    theme: themeOverridesSchema.optional(),
    privacy: privacySchema.partial().optional(),
    coverPhotoId: id.nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");

export const createRoomSchema = z.object({
  name: z.string().trim().min(1).max(60),
  roomType: z.enum(ROOM_TYPES).default("custom"),
  width: z.number().min(4).max(24).default(8),
  depth: z.number().min(4).max(24).default(7),
  height: z.number().min(3).max(8).default(4.2),
});

export const updateRoomSchema = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    roomType: z.enum(ROOM_TYPES).optional(),
    lightingPreset: z.enum(LIGHTING_PRESETS).nullable().optional(),
    lightingIntensity: z.number().min(0.2).max(2).nullable().optional(),
    wallColor: hexColor.nullable().optional(),
    floorMaterial: z.enum(FLOOR_MATERIALS).nullable().optional(),
    skylight: z.boolean().optional(),
    decor: z
      .array(
        z.object({
          id: z.string().min(1).max(64),
          type: z.enum(DECOR_TYPES),
          x: z.number().finite(),
          z: z.number().finite(),
          rotation: z.number().finite().default(0),
        }),
      )
      .max(16)
      .optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");

export const reorderRoomsSchema = z.object({ roomIds: z.array(id).min(1).max(40) });
