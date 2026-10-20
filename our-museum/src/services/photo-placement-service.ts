import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma, type Tx } from "@/lib/database/prisma";
import { errors } from "@/lib/errors";
import type { z } from "zod";
import type { placeFrameSchema, updateFrameSchema } from "@/lib/validation/photos";
import {
  checkPlacement,
  type FrameOptions,
  type FramePlacement,
  type FrameStyle,
} from "@/features/photo-placement/placement";
import { computeWallSpec, type WallKey } from "@/features/rooms/geometry";
import { requireMuseumAccess } from "./access";
import { recordEvent } from "./audit-service";
import { notifyMuseumChanged } from "./realtime-notify";
import { bumpLayoutVersion, toRoomShape } from "./room-service";

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** The printed height always follows the photo's real aspect ratio. */
function heightFor(width: number, photo: { width: number; height: number }) {
  return round3(width * (photo.height / photo.width));
}

async function validateOnWall(
  tx: Tx,
  museumId: string,
  roomId: string,
  wallKey: WallKey,
  candidate: FramePlacement,
  excludeFrameId: string | null,
  allowOverlap: boolean,
) {
  const roomRow = await tx.museumRoom.findFirst({ where: { id: roomId, museumId } });
  if (!roomRow) throw errors.notFound("Room not found");
  const wall = await tx.museumWall.findUnique({ where: { roomId_wallKey: { roomId, wallKey } } });
  if (!wall) throw errors.notFound("Wall not found");
  // Bounds are recomputed from the room geometry rather than trusting stored JSON.
  const spec = computeWallSpec(toRoomShape(roomRow), wallKey);
  const others = await tx.photoFrame.findMany({
    where: { wallId: wall.id, ...(excludeFrameId ? { id: { not: excludeFrameId } } : {}) },
  });
  const result = checkPlacement(
    spec.bounds,
    candidate,
    others.map((o) => ({
      id: o.id,
      u: o.positionU,
      v: o.positionV,
      width: o.width,
      height: o.height,
      rotation: o.rotation,
      style: o.frameStyle as FrameStyle,
      options: o.frameOptions as FrameOptions,
    })),
    { allowOverlap },
  );
  if (!result.ok) throw errors.placement("That spot on the wall isn't available.", { problem: result.problem, conflicts: result.conflicts });
  return { wall, overlaps: result.conflicts ?? [] };
}

export async function placeFrame(userId: string, museumId: string, input: z.infer<typeof placeFrameSchema>) {
  await requireMuseumAccess(userId, museumId, "frame.place");
  const frame = await prisma.$transaction(async (tx) => {
    const photo = await tx.photo.findFirst({ where: { id: input.photoId, museumId } });
    if (!photo) throw errors.notFound("Photo not found");
    const count = await tx.photoFrame.count({ where: { museumId } });
    if (count >= 1500) throw errors.conflict("This museum has the maximum number of frames.");
    const candidate: FramePlacement = {
      u: round3(input.u),
      v: round3(input.v),
      width: round3(input.width),
      height: heightFor(input.width, photo),
      rotation: round3(input.rotation),
      style: input.style,
      options: input.options,
    };
    const { wall, overlaps } = await validateOnWall(tx, museumId, input.roomId, input.wallKey, candidate, null, Boolean(input.allowOverlap));
    const created = await tx.photoFrame.create({
      data: {
        museumId,
        roomId: input.roomId,
        wallId: wall.id,
        photoId: photo.id,
        positionU: candidate.u,
        positionV: candidate.v,
        rotation: candidate.rotation,
        width: candidate.width,
        height: candidate.height,
        frameStyle: candidate.style,
        frameOptions: candidate.options as Prisma.InputJsonValue,
        caption: input.caption ?? null,
        metadata: overlaps.length ? { overlapsIntentionally: overlaps } : {},
        createdById: userId,
      },
    });
    await bumpLayoutVersion(tx, museumId);
    await recordEvent({ museumId, actorId: userId, eventType: "frame.placed", entityId: created.id, metadata: { roomId: input.roomId, wallKey: input.wallKey } }, tx);
    return created;
  });
  notifyMuseumChanged(museumId, "layout", userId);
  return frame;
}

export async function updateFrame(userId: string, museumId: string, frameId: string, patch: z.infer<typeof updateFrameSchema>) {
  await requireMuseumAccess(userId, museumId, "frame.edit");
  const frame = await prisma.$transaction(async (tx) => {
    const existing = await tx.photoFrame.findFirst({ where: { id: frameId, museumId }, include: { wall: true, photo: true } });
    if (!existing) throw errors.notFound("Frame not found");
    const roomId = patch.roomId ?? existing.roomId;
    const wallKey = (patch.wallKey ?? existing.wall.wallKey) as WallKey;
    const width = patch.width ?? existing.width;
    const candidate: FramePlacement = {
      u: round3(patch.u ?? existing.positionU),
      v: round3(patch.v ?? existing.positionV),
      width: round3(width),
      height: heightFor(width, existing.photo),
      rotation: round3(patch.rotation ?? existing.rotation),
      style: (patch.style ?? existing.frameStyle) as FrameStyle,
      options: (patch.options ?? existing.frameOptions) as FrameOptions,
    };
    const { wall, overlaps } = await validateOnWall(tx, museumId, roomId, wallKey, candidate, frameId, Boolean(patch.allowOverlap));
    const updated = await tx.photoFrame.update({
      where: { id: frameId },
      data: {
        roomId,
        wallId: wall.id,
        positionU: candidate.u,
        positionV: candidate.v,
        rotation: candidate.rotation,
        width: candidate.width,
        height: candidate.height,
        frameStyle: candidate.style,
        frameOptions: candidate.options as Prisma.InputJsonValue,
        ...(patch.caption !== undefined ? { caption: patch.caption } : {}),
        metadata: overlaps.length ? { overlapsIntentionally: overlaps } : {},
      },
    });
    await bumpLayoutVersion(tx, museumId);
    await recordEvent({ museumId, actorId: userId, eventType: "frame.updated", entityId: frameId }, tx);
    return updated;
  });
  notifyMuseumChanged(museumId, "layout", userId);
  return frame;
}

export async function deleteFrame(userId: string, museumId: string, frameId: string) {
  await requireMuseumAccess(userId, museumId, "frame.delete");
  await prisma.$transaction(async (tx) => {
    const res = await tx.photoFrame.deleteMany({ where: { id: frameId, museumId } });
    if (!res.count) throw errors.notFound("Frame not found");
    await bumpLayoutVersion(tx, museumId);
    await recordEvent({ museumId, actorId: userId, eventType: "frame.deleted", entityId: frameId }, tx);
  });
  notifyMuseumChanged(museumId, "layout", userId);
}

export function frameToResponse(f: {
  id: string;
  roomId: string;
  wallId: string;
  photoId: string;
  positionU: number;
  positionV: number;
  rotation: number;
  width: number;
  height: number;
  frameStyle: string;
  frameOptions: unknown;
  caption: string | null;
}) {
  return {
    id: f.id,
    roomId: f.roomId,
    wallId: f.wallId,
    photoId: f.photoId,
    u: f.positionU,
    v: f.positionV,
    rotation: f.rotation,
    width: f.width,
    height: f.height,
    style: f.frameStyle,
    options: f.frameOptions,
    caption: f.caption,
  };
}
