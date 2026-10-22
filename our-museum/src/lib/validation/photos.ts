import { z } from "zod";
import { FRAME_STYLES, frameOptionsSchema } from "@/features/photo-placement/placement";
import { WALL_KEYS } from "@/features/rooms/geometry";
import { ACCEPTED_MIME_TYPES } from "@/services/image-processing-types";

const id = z.string().min(8).max(64);

export const createUploadSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  mimeType: z.string().max(100),
  size: z.number().int().positive(),
});

export const completeUploadSchema = z.object({
  title: z.string().trim().max(120).optional(),
  caption: z.string().trim().max(2000).optional(),
  takenAt: z.iso.date().nullable().optional(),
  collectionId: id.nullable().optional(),
});

export const updatePhotoSchema = z
  .object({
    title: z.string().trim().max(120).optional(),
    caption: z.string().trim().max(2000).optional(),
    takenAt: z.iso.date().nullable().optional(),
    collectionIds: z.array(id).max(50).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");

export const collectionSchema = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(300).optional(),
});

export const collectionPhotosSchema = z.object({ photoIds: z.array(id).max(2000) });
export const orderSchema = z.object({ ids: z.array(id).min(1).max(200) });

export const placeFrameSchema = z.object({
  photoId: id,
  roomId: id,
  wallKey: z.enum(WALL_KEYS),
  u: z.number().finite(),
  v: z.number().finite(),
  width: z.number().finite(),
  rotation: z.number().finite().default(0),
  style: z.enum(FRAME_STYLES),
  options: frameOptionsSchema.default({}),
  caption: z.string().trim().max(120).nullable().optional(),
  allowOverlap: z.boolean().optional(),
});

export const updateFrameSchema = z
  .object({
    roomId: id.optional(),
    wallKey: z.enum(WALL_KEYS).optional(),
    u: z.number().finite().optional(),
    v: z.number().finite().optional(),
    width: z.number().finite().optional(),
    rotation: z.number().finite().optional(),
    style: z.enum(FRAME_STYLES).optional(),
    options: frameOptionsSchema.optional(),
    caption: z.string().trim().max(120).nullable().optional(),
    /** Hang a different photograph in this frame (same spot; the frame follows its shape). */
    photoId: id.optional(),
    allowOverlap: z.boolean().optional(),
    /** The frame version the edit was based on; a newer stored version means someone else changed it. */
    expectedVersion: z.number().int().positive().optional(),
  })
  .refine((v) => Object.keys(v).some((k) => k !== "expectedVersion" && k !== "allowOverlap"), "Nothing to update");

export { ACCEPTED_MIME_TYPES };
