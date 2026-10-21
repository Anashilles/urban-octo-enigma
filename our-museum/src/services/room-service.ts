import "server-only";
import type { MuseumRoom, Prisma } from "@/generated/prisma/client";
import { prisma, type Tx } from "@/lib/database/prisma";
import { errors } from "@/lib/errors";
import {
  checkPlacement,
  frameFootprint,
  type FrameOptions,
  type FrameStyle,
} from "@/features/photo-placement/placement";
import {
  computeWallSpec,
  connectRooms,
  DOORWAY_MARGIN,
  findAttachmentSpot,
  reachableRooms,
  roomLayoutSchema,
  sharedWall,
  WALL_KEYS,
  type RoomLayoutConfig,
  type RoomShape,
} from "@/features/rooms/geometry";
import type { z } from "zod";
import type { createRoomSchema, updateRoomSchema } from "@/lib/validation/museum";
import { requireMuseumAccess } from "./access";
import { recordEvent } from "./audit-service";
import { tidyNarrations } from "./narration-service";
import { notifyMuseumChanged } from "./realtime-notify";

export function toRoomShape(row: MuseumRoom): RoomShape {
  const parsed = roomLayoutSchema.safeParse(row.layout);
  const layout: RoomLayoutConfig = parsed.success ? parsed.data : { doorways: [], lighting: {}, decor: [] };
  return {
    id: row.id,
    name: row.name,
    roomType: row.roomType,
    width: row.width,
    depth: row.depth,
    height: row.height,
    positionX: row.positionX,
    positionZ: row.positionZ,
    rotation: row.rotation,
    layout,
    sortOrder: row.sortOrder,
  };
}

/** Creates or updates the four wall rows of a room from its current geometry. */
export async function syncWalls(tx: Tx, room: RoomShape) {
  for (const key of WALL_KEYS) {
    const spec = computeWallSpec(room, key);
    const data = {
      length: spec.length,
      height: spec.height,
      transform: spec.transform as unknown as Prisma.InputJsonValue,
      bounds: spec.bounds as unknown as Prisma.InputJsonValue,
    };
    await tx.museumWall.upsert({
      where: { roomId_wallKey: { roomId: room.id, wallKey: key } },
      create: { roomId: room.id, wallKey: key, ...data },
      update: data,
    });
  }
}

export async function bumpLayoutVersion(tx: Tx, museumId: string) {
  await tx.museum.update({ where: { id: museumId }, data: { layoutVersion: { increment: 1 } } });
}

export async function listRooms(museumId: string, db: Tx | typeof prisma = prisma) {
  return db.museumRoom.findMany({ where: { museumId }, orderBy: { sortOrder: "asc" }, include: { walls: true } });
}

/**
 * Attaches a new room to a free side of the museum and opens a doorway into
 * it, choosing a door position that does not cut through existing frames.
 */
export async function createRoom(userId: string, museumId: string, input: z.infer<typeof createRoomSchema>) {
  await requireMuseumAccess(userId, museumId, "room.create");
  return prisma.$transaction(async (tx) => {
    const rows = await tx.museumRoom.findMany({ where: { museumId }, orderBy: { sortOrder: "asc" } });
    if (rows.length >= 24) throw errors.conflict("This museum already has the maximum number of rooms.");
    const rooms = rows.map(toRoomShape);
    const spot = findAttachmentSpot(rooms, { width: input.width, depth: input.depth });
    if (!spot) throw errors.conflict("There is no free space to attach a new room.");
    const anchor = rooms.find((r) => r.id === spot.anchorId)!;
    const created = await tx.museumRoom.create({
      data: {
        museumId,
        name: input.name,
        roomType: input.roomType,
        width: input.width,
        depth: input.depth,
        height: input.height,
        positionX: spot.positionX,
        positionZ: spot.positionZ,
        rotation: 0,
        layout: { doorways: [], lighting: {}, decor: [] },
        sortOrder: Math.max(0, ...rooms.map((r) => r.sortOrder)) + 1,
      },
    });
    const room = toRoomShape(created);
    const anchorFrames = await tx.photoFrame.findMany({ where: { roomId: anchor.id }, include: { wall: true } });
    const shared = sharedWall(anchor, room)!;
    const wallFrames = anchorFrames.filter((f) => f.wall.wallKey === shared.wallA);
    // Try door centres from the middle of the shared stretch outward until one is clear of frames.
    const mid = (shared.from + shared.to) / 2;
    const candidates = [0];
    for (let d = 0.25; d < (shared.to - shared.from) / 2; d += 0.25) candidates.push(d, -d);
    let connected = false;
    for (const c of candidates) {
      const a = structuredClone(anchor);
      const b = structuredClone(room);
      if (!connectRooms(a, b, { at: mid + c })) continue;
      const spec = computeWallSpec(a, shared.wallA);
      const blocked = wallFrames.some((f) => {
        const fp = frameFootprint({
          u: f.positionU,
          v: f.positionV,
          width: f.width,
          height: f.height,
          rotation: f.rotation,
          style: f.frameStyle as FrameStyle,
          options: f.frameOptions as FrameOptions,
        });
        return spec.bounds.exclusions.some(
          (x) => fp.minU < x.maxU + DOORWAY_MARGIN && fp.maxU > x.minU - DOORWAY_MARGIN && fp.minV < x.maxV,
        );
      });
      if (blocked) continue;
      anchor.layout = a.layout;
      room.layout = b.layout;
      connected = true;
      break;
    }
    if (!connected) {
      throw errors.conflict(`Make some space on the ${shared.wallA} wall of “${anchor.name}” for a doorway first.`, {
        roomId: anchor.id,
        wall: shared.wallA,
      });
    }
    await tx.museumRoom.update({ where: { id: anchor.id }, data: { layout: anchor.layout as Prisma.InputJsonValue } });
    await tx.museumRoom.update({ where: { id: room.id }, data: { layout: room.layout as Prisma.InputJsonValue } });
    await syncWalls(tx, anchor);
    await syncWalls(tx, room);
    await bumpLayoutVersion(tx, museumId);
    await recordEvent({ museumId, actorId: userId, eventType: "room.created", entityId: room.id }, tx);
    return room;
  }).then((room) => {
    notifyMuseumChanged(museumId, "layout", userId);
    return room;
  });
}

export async function updateRoom(userId: string, museumId: string, roomId: string, patch: z.infer<typeof updateRoomSchema>) {
  await requireMuseumAccess(userId, museumId, "room.edit");
  const result = await prisma.$transaction(async (tx) => {
    const row = await tx.museumRoom.findFirst({ where: { id: roomId, museumId } });
    if (!row) throw errors.notFound("Room not found");
    const room = toRoomShape(row);
    const layout: RoomLayoutConfig = { ...room.layout, lighting: { ...room.layout.lighting } };
    if (patch.lightingPreset !== undefined) layout.lighting.preset = patch.lightingPreset ?? undefined;
    if (patch.lightingIntensity !== undefined) layout.lighting.intensity = patch.lightingIntensity ?? undefined;
    if (patch.wallColor !== undefined) layout.wallColor = patch.wallColor ?? undefined;
    if (patch.floorMaterial !== undefined) layout.floorMaterial = patch.floorMaterial ?? undefined;
    if (patch.skylight !== undefined) layout.skylight = patch.skylight;
    if (patch.decor !== undefined) {
      // Decor must stay inside the room and clear of doorways' approach.
      for (const d of patch.decor) {
        if (Math.abs(d.x) > room.width / 2 - 0.6 || Math.abs(d.z) > room.depth / 2 - 0.6) {
          throw errors.validation("Decor must stay inside the room");
        }
      }
      layout.decor = patch.decor;
    }
    const updated = await tx.museumRoom.update({
      where: { id: roomId },
      data: {
        ...(patch.name ? { name: patch.name } : {}),
        ...(patch.roomType ? { roomType: patch.roomType } : {}),
        layout: layout as Prisma.InputJsonValue,
      },
    });
    await bumpLayoutVersion(tx, museumId);
    await recordEvent({ museumId, actorId: userId, eventType: "room.updated", entityId: roomId }, tx);
    return toRoomShape(updated);
  });
  notifyMuseumChanged(museumId, "layout", userId);
  return result;
}

export async function reorderRooms(userId: string, museumId: string, roomIds: string[]) {
  await requireMuseumAccess(userId, museumId, "room.edit");
  await prisma.$transaction(async (tx) => {
    const rows = await tx.museumRoom.findMany({ where: { museumId }, select: { id: true } });
    const ids = new Set(rows.map((r) => r.id));
    if (roomIds.length !== ids.size || roomIds.some((id) => !ids.has(id))) throw errors.validation("Room list does not match");
    for (const [index, id] of roomIds.entries()) {
      await tx.museumRoom.update({ where: { id }, data: { sortOrder: index } });
    }
    await bumpLayoutVersion(tx, museumId);
  });
  notifyMuseumChanged(museumId, "layout", userId);
}

/**
 * Deletes a room. Frames hanging in it are removed (the photos themselves stay
 * in the museum library). When frames exist the caller must confirm, so work
 * is never discarded by accident. Rooms whose removal would cut other rooms
 * off from the lobby cannot be deleted.
 */
export async function deleteRoom(userId: string, museumId: string, roomId: string, opts: { confirm?: boolean } = {}) {
  await requireMuseumAccess(userId, museumId, "room.delete");
  const result = await prisma.$transaction(async (tx) => {
    const rows = await tx.museumRoom.findMany({ where: { museumId }, orderBy: { sortOrder: "asc" } });
    const target = rows.find((r) => r.id === roomId);
    if (!target) throw errors.notFound("Room not found");
    if (rows.length <= 1) throw errors.conflict("A museum needs at least one room.");
    const rooms = rows.map(toRoomShape);
    const entrance = rooms.find((r) => r.roomType === "lobby") ?? rooms[0]!;
    if (entrance.id === roomId) throw errors.conflict("The entrance lobby cannot be deleted.");
    const remaining = rooms
      .filter((r) => r.id !== roomId)
      .map((r) => ({ ...r, layout: { ...r.layout, doorways: r.layout.doorways.filter((d) => d.connectsTo !== roomId) } }));
    if (reachableRooms(remaining, entrance.id).size !== remaining.length) {
      throw errors.conflict("Deleting this room would cut other rooms off from the entrance.", { reason: "disconnects" });
    }
    const frameCount = await tx.photoFrame.count({ where: { roomId } });
    if (frameCount > 0 && !opts.confirm) {
      throw errors.conflict("This room still has framed photos. Confirm to remove them.", { reason: "has_frames", frameCount });
    }
    for (const neighbour of remaining) {
      const before = rooms.find((r) => r.id === neighbour.id)!;
      if (before.layout.doorways.length !== neighbour.layout.doorways.length) {
        await tx.museumRoom.update({ where: { id: neighbour.id }, data: { layout: neighbour.layout as Prisma.InputJsonValue } });
        await syncWalls(tx, neighbour);
      }
    }
    await tx.museumRoom.delete({ where: { id: roomId } });
    await bumpLayoutVersion(tx, museumId);
    await recordEvent({ museumId, actorId: userId, eventType: "room.deleted", entityId: roomId, metadata: { frameCount } }, tx);
    return { frameCount };
  });
  if (result.frameCount) await tidyNarrations(museumId);
  notifyMuseumChanged(museumId, "layout", userId);
  return result;
}

/** Validates that every frame on a wall still fits after a layout change (used by tests and diagnostics). */
export async function findInvalidFrames(museumId: string) {
  const rooms = (await listRooms(museumId)).map((r) => ({ row: r, shape: toRoomShape(r) }));
  const frames = await prisma.photoFrame.findMany({ where: { museumId }, include: { wall: true } });
  const invalid: string[] = [];
  for (const f of frames) {
    const room = rooms.find((r) => r.row.id === f.roomId);
    if (!room) {
      invalid.push(f.id);
      continue;
    }
    const spec = computeWallSpec(room.shape, f.wall.wallKey as (typeof WALL_KEYS)[number]);
    const p = {
      u: f.positionU,
      v: f.positionV,
      width: f.width,
      height: f.height,
      rotation: f.rotation,
      style: f.frameStyle as FrameStyle,
      options: f.frameOptions as FrameOptions,
    };
    if (!checkPlacement(spec.bounds, p, [], { allowOverlap: true }).ok) invalid.push(f.id);
  }
  return invalid;
}
