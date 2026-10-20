/**
 * Data-driven museum architecture. Pure functions shared by the browser (3D
 * rendering, collision, editor) and the server (authoritative validation).
 *
 * Conventions
 * - World units are metres. +X is east, −Z is north, +Y is up.
 * - A room is an axis-aligned rectangle of *interior* size width×depth centred
 *   at (positionX, positionZ). Each wall is a slab WALL_THICKNESS/2 thick that
 *   sits outside the interior, so two adjacent rooms are separated by exactly
 *   WALL_THICKNESS and their slabs meet without overlapping.
 * - Wall-local coordinates: `u` runs along the wall left→right as seen from
 *   inside the room facing the wall (0 = wall centre); `v` is height above the
 *   floor. Frames are stored in these coordinates.
 */
import { z } from "zod";

export const WALL_THICKNESS = 0.3;
export const HALF_WALL = WALL_THICKNESS / 2;
export const DEFAULT_DOOR_WIDTH = 2.2;
export const DEFAULT_DOOR_HEIGHT = 3.0;
export const PLAYER_RADIUS = 0.28;
export const EYE_HEIGHT = 1.62;

export const WALL_KEYS = ["north", "east", "south", "west"] as const;
export type WallKey = (typeof WALL_KEYS)[number];

export const ROOM_TYPES = ["lobby", "hall", "gallery", "corridor", "special", "reflection", "custom"] as const;
export type RoomType = (typeof ROOM_TYPES)[number];

export const LIGHTING_PRESETS = ["gallery", "warm", "cool", "dramatic", "soft"] as const;
export type LightingPreset = (typeof LIGHTING_PRESETS)[number];

export const FLOOR_MATERIALS = ["oak", "walnut-herringbone", "concrete", "marble-white", "marble-black", "travertine"] as const;
export type FloorMaterial = (typeof FLOOR_MATERIALS)[number];

export const DECOR_TYPES = ["bench", "pedestal", "plant", "sculpture"] as const;

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const doorwaySchema = z.object({
  id: z.string().min(1).max(64),
  wall: z.enum(WALL_KEYS),
  /** Centre of the opening along the wall in wall-local u. */
  offset: z.number().finite(),
  width: z.number().min(0.9).max(6),
  height: z.number().min(2).max(6),
  /** Room on the other side, when this doorway connects two rooms. */
  connectsTo: z.string().max(64).nullable().optional(),
});
export type Doorway = z.infer<typeof doorwaySchema>;

export const decorSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.enum(DECOR_TYPES),
  x: z.number().finite(),
  z: z.number().finite(),
  rotation: z.number().finite().default(0),
});
export type RoomDecor = z.infer<typeof decorSchema>;

export const roomLayoutSchema = z.object({
  doorways: z.array(doorwaySchema).max(12).default([]),
  lighting: z
    .object({
      preset: z.enum(LIGHTING_PRESETS).optional(),
      intensity: z.number().min(0.2).max(2).optional(),
    })
    .default({}),
  wallColor: hexColor.optional(),
  floorMaterial: z.enum(FLOOR_MATERIALS).optional(),
  skylight: z.boolean().optional(),
  decor: z.array(decorSchema).max(16).default([]),
});
export type RoomLayoutConfig = z.infer<typeof roomLayoutSchema>;

/** The architectural description of a room (DB row shape, minus timestamps). */
export interface RoomShape {
  id: string;
  name: string;
  roomType: RoomType | string;
  width: number;
  depth: number;
  height: number;
  positionX: number;
  positionZ: number;
  rotation: number;
  layout: RoomLayoutConfig;
  sortOrder: number;
}

export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface UVRect {
  minU: number;
  maxU: number;
  minV: number;
  maxV: number;
}

export interface WallTransform {
  /** Wall centre at floor level, relative to the room centre. */
  position: [number, number, number];
  /** Yaw so the wall group's local +Z points into the room. */
  rotationY: number;
}

export interface PlacementBounds extends UVRect {
  exclusions: UVRect[];
}

export interface WallSpec {
  wallKey: WallKey;
  length: number;
  height: number;
  transform: WallTransform;
  bounds: PlacementBounds;
}

export const WALL_EDGE_MARGIN = 0.15;
export const WALL_FLOOR_MARGIN = 0.35;
export const WALL_CEILING_MARGIN = 0.25;
export const DOORWAY_MARGIN = 0.12;

export function wallLength(room: Pick<RoomShape, "width" | "depth">, wall: WallKey): number {
  return wall === "north" || wall === "south" ? room.width : room.depth;
}

/** Wall placement in room-local space. */
export function wallTransform(room: Pick<RoomShape, "width" | "depth">, wall: WallKey): WallTransform {
  const hw = room.width / 2;
  const hd = room.depth / 2;
  switch (wall) {
    case "north":
      return { position: [0, 0, -hd], rotationY: 0 };
    case "south":
      return { position: [0, 0, hd], rotationY: Math.PI };
    case "east":
      return { position: [hw, 0, 0], rotationY: -Math.PI / 2 };
    case "west":
      return { position: [-hw, 0, 0], rotationY: Math.PI / 2 };
  }
}

/** Converts a wall-local u coordinate to a room-local (x, z) point on the wall's inner face. */
export function wallUToRoomLocal(room: Pick<RoomShape, "width" | "depth">, wall: WallKey, u: number): [number, number] {
  const hw = room.width / 2;
  const hd = room.depth / 2;
  switch (wall) {
    case "north":
      return [u, -hd];
    case "south":
      return [-u, hd];
    case "east":
      return [hw, u];
    case "west":
      return [-hw, -u];
  }
}

/** Inverse of wallUToRoomLocal along the wall axis. */
export function roomLocalToWallU(wall: WallKey, x: number, z: number): number {
  switch (wall) {
    case "north":
      return x;
    case "south":
      return -x;
    case "east":
      return z;
    case "west":
      return -z;
  }
}

/** Inward-facing unit normal of a wall in room-local space. */
export function wallNormal(wall: WallKey): [number, number] {
  switch (wall) {
    case "north":
      return [0, 1];
    case "south":
      return [0, -1];
    case "east":
      return [-1, 0];
    case "west":
      return [1, 0];
  }
}

function rotate2(x: number, z: number, degrees: number): [number, number] {
  if (!degrees) return [x, z];
  const r = (degrees * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  // Same convention as three.js Object3D.rotation.y
  return [x * c + z * s, -x * s + z * c];
}

export function roomLocalToWorld(room: Pick<RoomShape, "positionX" | "positionZ" | "rotation">, x: number, z: number): [number, number] {
  const [rx, rz] = rotate2(x, z, room.rotation);
  return [room.positionX + rx, room.positionZ + rz];
}

export function worldToRoomLocal(room: Pick<RoomShape, "positionX" | "positionZ" | "rotation">, x: number, z: number): [number, number] {
  return rotate2(x - room.positionX, z - room.positionZ, -room.rotation);
}

/** World-space point and inward normal for a wall-local coordinate. */
export function wallPointWorld(room: RoomShape, wall: WallKey, u: number): { x: number; z: number; nx: number; nz: number } {
  const [lx, lz] = wallUToRoomLocal(room, wall, u);
  const [x, z] = roomLocalToWorld(room, lx, lz);
  const [nlx, nlz] = wallNormal(wall);
  const [nx, nz] = rotate2(nlx, nlz, room.rotation);
  return { x, z, nx, nz };
}

export function computeWallSpec(room: RoomShape, wall: WallKey): WallSpec {
  const length = wallLength(room, wall);
  const exclusions: UVRect[] = room.layout.doorways
    .filter((d) => d.wall === wall)
    .map((d) => ({
      minU: d.offset - d.width / 2 - DOORWAY_MARGIN,
      maxU: d.offset + d.width / 2 + DOORWAY_MARGIN,
      minV: 0,
      maxV: Math.min(room.height, d.height + DOORWAY_MARGIN),
    }));
  return {
    wallKey: wall,
    length,
    height: room.height,
    transform: wallTransform(room, wall),
    bounds: {
      minU: -length / 2 + WALL_EDGE_MARGIN,
      maxU: length / 2 - WALL_EDGE_MARGIN,
      minV: WALL_FLOOR_MARGIN,
      maxV: room.height - WALL_CEILING_MARGIN,
      exclusions,
    },
  };
}

export function computeWallSpecs(room: RoomShape): WallSpec[] {
  return WALL_KEYS.map((w) => computeWallSpec(room, w));
}

/** Interior rectangle in world space (exact for rotations that are multiples of 90°). */
export function roomInteriorRect(room: RoomShape, inflate = 0): Rect {
  const corners = [
    [-room.width / 2 - inflate, -room.depth / 2 - inflate],
    [room.width / 2 + inflate, -room.depth / 2 - inflate],
    [room.width / 2 + inflate, room.depth / 2 + inflate],
    [-room.width / 2 - inflate, room.depth / 2 + inflate],
  ].map(([x, z]) => roomLocalToWorld(room, x!, z!));
  return {
    minX: Math.min(...corners.map((c) => c[0])),
    maxX: Math.max(...corners.map((c) => c[0])),
    minZ: Math.min(...corners.map((c) => c[1])),
    maxZ: Math.max(...corners.map((c) => c[1])),
  };
}

/** Wall segments (solid parts between doorways) along u for one wall. */
export function wallSolidSegments(room: RoomShape, wall: WallKey): Array<{ from: number; to: number; doorAbove?: Doorway }> {
  const length = wallLength(room, wall);
  // Extend each wall over the corners so adjacent walls meet cleanly.
  const start = -length / 2 - HALF_WALL;
  const end = length / 2 + HALF_WALL;
  const doors = room.layout.doorways
    .filter((d) => d.wall === wall)
    .sort((a, b) => a.offset - b.offset);
  const segments: Array<{ from: number; to: number; doorAbove?: Doorway }> = [];
  let cursor = start;
  for (const d of doors) {
    const a = Math.max(start, d.offset - d.width / 2);
    const b = Math.min(end, d.offset + d.width / 2);
    if (a > cursor) segments.push({ from: cursor, to: a });
    // Lintel above the opening (rendered, but not a collision obstacle).
    if (d.height < room.height) segments.push({ from: a, to: b, doorAbove: d });
    cursor = Math.max(cursor, b);
  }
  if (cursor < end) segments.push({ from: cursor, to: end });
  return segments;
}

/** World-space AABBs of all solid wall parts, used for player/camera collision. */
export function collisionBoxes(rooms: RoomShape[]): Rect[] {
  const boxes: Rect[] = [];
  for (const room of rooms) {
    for (const wall of WALL_KEYS) {
      for (const seg of wallSolidSegments(room, wall)) {
        if (seg.doorAbove) continue;
        // Segment as a rectangle in room-local space: along-wall [from,to], thickness outward.
        const p1 = wallUToRoomLocal(room, wall, seg.from);
        const p2 = wallUToRoomLocal(room, wall, seg.to);
        const [nx, nz] = wallNormal(wall);
        const outer1: [number, number] = [p1[0] - nx * HALF_WALL, p1[1] - nz * HALF_WALL];
        const outer2: [number, number] = [p2[0] - nx * HALF_WALL, p2[1] - nz * HALF_WALL];
        const pts = [p1, p2, outer1, outer2].map(([x, z]) => roomLocalToWorld(room, x, z));
        boxes.push({
          minX: Math.min(...pts.map((p) => p[0])),
          maxX: Math.max(...pts.map((p) => p[0])),
          minZ: Math.min(...pts.map((p) => p[1])),
          maxZ: Math.max(...pts.map((p) => p[1])),
        });
      }
    }
    for (const d of room.layout.decor) {
      const size = DECOR_FOOTPRINT[d.type];
      if (!size) continue;
      const rot = ((d.rotation % 180) + 180) % 180;
      const [w, dd] = Math.abs(rot - 90) < 45 ? [size[1], size[0]] : size;
      const [cx, cz] = roomLocalToWorld(room, d.x, d.z);
      boxes.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - dd / 2, maxZ: cz + dd / 2 });
    }
  }
  return boxes;
}

/** Footprint (width, depth) of decor items for collision. */
export const DECOR_FOOTPRINT: Record<(typeof DECOR_TYPES)[number], [number, number]> = {
  bench: [1.8, 0.55],
  pedestal: [0.6, 0.6],
  plant: [0.6, 0.6],
  sculpture: [0.8, 0.8],
};

/**
 * Pushes a circle out of the given boxes. Returns the corrected position.
 * A few relaxation passes resolve corners where two boxes meet.
 */
export function resolveCircleCollisions(x: number, z: number, radius: number, boxes: Rect[]): [number, number] {
  let px = x;
  let pz = z;
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (const b of boxes) {
      if (px < b.minX - radius || px > b.maxX + radius || pz < b.minZ - radius || pz > b.maxZ + radius) continue;
      const cx = Math.max(b.minX, Math.min(px, b.maxX));
      const cz = Math.max(b.minZ, Math.min(pz, b.maxZ));
      let dx = px - cx;
      let dz = pz - cz;
      const dist2 = dx * dx + dz * dz;
      if (dist2 >= radius * radius) continue;
      if (dist2 > 1e-10) {
        const dist = Math.sqrt(dist2);
        const push = radius - dist;
        px += (dx / dist) * push;
        pz += (dz / dist) * push;
      } else {
        // Centre is inside the box: leave by the nearest face.
        const left = px - b.minX;
        const right = b.maxX - px;
        const top = pz - b.minZ;
        const bottom = b.maxZ - pz;
        const m = Math.min(left, right, top, bottom);
        if (m === left) px = b.minX - radius;
        else if (m === right) px = b.maxX + radius;
        else if (m === top) pz = b.minZ - radius;
        else pz = b.maxZ + radius;
        dx = dz = 0;
      }
      moved = true;
    }
    if (!moved) break;
  }
  return [px, pz];
}

/**
 * Distance along a 2D segment until it first touches any box (slab test),
 * used to keep the third-person camera from clipping through walls.
 */
export function segmentHitDistance(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  boxes: Rect[],
  padding = 0.12,
): number {
  const dx = bx - ax;
  const dz = bz - az;
  const length = Math.hypot(dx, dz);
  let best = 1;
  for (const raw of boxes) {
    const b = { minX: raw.minX - padding, maxX: raw.maxX + padding, minZ: raw.minZ - padding, maxZ: raw.maxZ + padding };
    // Start inside a box (e.g. hugging a wall): ignore that box.
    if (ax >= b.minX && ax <= b.maxX && az >= b.minZ && az <= b.maxZ) continue;
    let tmin = 0;
    let tmax = 1;
    for (const [o, d, lo, hi] of [
      [ax, dx, b.minX, b.maxX],
      [az, dz, b.minZ, b.maxZ],
    ] as const) {
      if (Math.abs(d) < 1e-9) {
        if (o < lo || o > hi) {
          tmin = 2;
          break;
        }
      } else {
        let t1 = (lo - o) / d;
        let t2 = (hi - o) / d;
        if (t1 > t2) [t1, t2] = [t2, t1];
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) {
          tmin = 2;
          break;
        }
      }
    }
    if (tmin <= 1 && tmin < best) best = tmin;
  }
  return best * length;
}

/** Which room (if any) contains the world point. */
export function roomAt(rooms: RoomShape[], x: number, z: number, tolerance = HALF_WALL): RoomShape | null {
  for (const room of rooms) {
    const r = roomInteriorRect(room, tolerance);
    if (x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ) return room;
  }
  return null;
}

// ─── Adjacency and doorways ────────────────────────────────────────────────

export interface SharedWall {
  wallA: WallKey;
  wallB: WallKey;
  /** Overlap of the two interiors along the shared wall, in world coordinates. */
  from: number;
  to: number;
  axis: "x" | "z";
}

const EPS = 1e-3;

/** Detects whether two (unrotated) rooms share a wall separated by WALL_THICKNESS. */
export function sharedWall(a: RoomShape, b: RoomShape): SharedWall | null {
  const ra = roomInteriorRect(a);
  const rb = roomInteriorRect(b);
  const overlapX: [number, number] = [Math.max(ra.minX, rb.minX), Math.min(ra.maxX, rb.maxX)];
  const overlapZ: [number, number] = [Math.max(ra.minZ, rb.minZ), Math.min(ra.maxZ, rb.maxZ)];
  if (Math.abs(ra.minZ - rb.maxZ - WALL_THICKNESS) < EPS && overlapX[1] - overlapX[0] > EPS)
    return { wallA: "north", wallB: "south", from: overlapX[0], to: overlapX[1], axis: "x" };
  if (Math.abs(rb.minZ - ra.maxZ - WALL_THICKNESS) < EPS && overlapX[1] - overlapX[0] > EPS)
    return { wallA: "south", wallB: "north", from: overlapX[0], to: overlapX[1], axis: "x" };
  if (Math.abs(rb.minX - ra.maxX - WALL_THICKNESS) < EPS && overlapZ[1] - overlapZ[0] > EPS)
    return { wallA: "east", wallB: "west", from: overlapZ[0], to: overlapZ[1], axis: "z" };
  if (Math.abs(ra.minX - rb.maxX - WALL_THICKNESS) < EPS && overlapZ[1] - overlapZ[0] > EPS)
    return { wallA: "west", wallB: "east", from: overlapZ[0], to: overlapZ[1], axis: "z" };
  return null;
}

/** World coordinate along the shared axis → wall-local u for a room's wall. */
function worldAlongToU(room: RoomShape, wall: WallKey, along: number): number {
  const [lx, lz] = worldToRoomLocal(room, wall === "north" || wall === "south" ? along : room.positionX, wall === "east" || wall === "west" ? along : room.positionZ);
  return roomLocalToWallU(wall, lx, lz);
}

/**
 * Creates matching doorways in two adjacent rooms. Returns false when the
 * rooms are not adjacent or the shared stretch is too short for a door.
 */
export function connectRooms(
  a: RoomShape,
  b: RoomShape,
  opts: { width?: number; height?: number; at?: number } = {},
): boolean {
  const shared = sharedWall(a, b);
  if (!shared) return false;
  const span = shared.to - shared.from;
  const width = Math.min(opts.width ?? DEFAULT_DOOR_WIDTH, span - 0.6);
  if (width < 1) return false;
  const height = Math.min(opts.height ?? DEFAULT_DOOR_HEIGHT, a.height - 0.4, b.height - 0.4);
  const centre = Math.min(Math.max(opts.at ?? (shared.from + shared.to) / 2, shared.from + width / 2 + 0.3), shared.to - width / 2 - 0.3);
  const id = `door-${[a.id, b.id].sort().join("-")}`;
  a.layout.doorways = a.layout.doorways.filter((d) => d.connectsTo !== b.id);
  b.layout.doorways = b.layout.doorways.filter((d) => d.connectsTo !== a.id);
  a.layout.doorways.push({ id, wall: shared.wallA, offset: round(worldAlongToU(a, shared.wallA, centre)), width, height, connectsTo: b.id });
  b.layout.doorways.push({ id, wall: shared.wallB, offset: round(worldAlongToU(b, shared.wallB, centre)), width, height, connectsTo: a.id });
  return true;
}

export function round(n: number, step = 0.001): number {
  return Math.round(n / step) * step;
}

/** World-space centre of a doorway (at floor level). */
export function doorwayWorldCentre(room: RoomShape, d: Doorway): { x: number; z: number } {
  const p = wallPointWorld(room, d.wall, d.offset);
  return { x: p.x - p.nx * HALF_WALL, z: p.z - p.nz * HALF_WALL };
}

/** Rooms reachable from `startId` (BFS over doorways). */
export function reachableRooms(rooms: RoomShape[], startId: string): Set<string> {
  const byId = new Map(rooms.map((r) => [r.id, r]));
  const seen = new Set<string>([startId]);
  const queue = [startId];
  while (queue.length) {
    const room = byId.get(queue.shift()!);
    if (!room) continue;
    for (const d of room.layout.doorways) {
      if (d.connectsTo && byId.has(d.connectsTo) && !seen.has(d.connectsTo)) {
        seen.add(d.connectsTo);
        queue.push(d.connectsTo);
      }
    }
  }
  return seen;
}

/** Shortest room path (list of doorway waypoints) between two rooms. */
export function roomPath(rooms: RoomShape[], fromId: string, toId: string): Array<{ roomId: string; via: { x: number; z: number } }> | null {
  if (fromId === toId) return [];
  const byId = new Map(rooms.map((r) => [r.id, r]));
  const prev = new Map<string, { from: string; door: Doorway }>();
  const queue = [fromId];
  const seen = new Set([fromId]);
  while (queue.length) {
    const id = queue.shift()!;
    if (id === toId) break;
    const room = byId.get(id);
    if (!room) continue;
    for (const d of room.layout.doorways) {
      if (!d.connectsTo || seen.has(d.connectsTo) || !byId.has(d.connectsTo)) continue;
      seen.add(d.connectsTo);
      prev.set(d.connectsTo, { from: id, door: d });
      queue.push(d.connectsTo);
    }
  }
  if (!prev.has(toId)) return null;
  const steps: Array<{ roomId: string; via: { x: number; z: number } }> = [];
  let cur = toId;
  while (cur !== fromId) {
    const p = prev.get(cur)!;
    steps.unshift({ roomId: cur, via: doorwayWorldCentre(byId.get(p.from)!, p.door) });
    cur = p.from;
  }
  return steps;
}

/**
 * Validates a whole layout: rooms must not overlap, doorways must sit inside
 * their walls and pair up with a doorway on the connected room.
 */
export function validateLayout(rooms: RoomShape[]): string[] {
  const problems: string[] = [];
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const a = roomInteriorRect(rooms[i]!, HALF_WALL - EPS);
      const b = roomInteriorRect(rooms[j]!, HALF_WALL - EPS);
      if (a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ) {
        problems.push(`rooms ${rooms[i]!.id} and ${rooms[j]!.id} overlap`);
      }
    }
  }
  const byId = new Map(rooms.map((r) => [r.id, r]));
  for (const room of rooms) {
    for (const d of room.layout.doorways) {
      const len = wallLength(room, d.wall);
      if (Math.abs(d.offset) + d.width / 2 > len / 2 + EPS) problems.push(`doorway ${d.id} exceeds wall ${room.id}.${d.wall}`);
      if (d.connectsTo) {
        const other = byId.get(d.connectsTo);
        if (!other) problems.push(`doorway ${d.id} connects to missing room ${d.connectsTo}`);
        else if (!other.layout.doorways.some((o) => o.connectsTo === room.id)) problems.push(`doorway ${d.id} has no partner`);
      }
    }
  }
  return problems;
}

/**
 * Finds a free side of an existing room where a new room of the given size can
 * be attached without overlapping anything. Used when adding rooms.
 */
export function findAttachmentSpot(
  rooms: RoomShape[],
  size: { width: number; depth: number },
): { anchorId: string; positionX: number; positionZ: number } | null {
  const sides: Array<[WallKey, number, number]> = [];
  for (const anchor of [...rooms].sort((a, b) => a.sortOrder - b.sortOrder).reverse()) {
    const r = roomInteriorRect(anchor);
    sides.length = 0;
    sides.push(
      ["north", (r.minX + r.maxX) / 2, r.minZ - WALL_THICKNESS - size.depth / 2],
      ["east", r.maxX + WALL_THICKNESS + size.width / 2, (r.minZ + r.maxZ) / 2],
      ["west", r.minX - WALL_THICKNESS - size.width / 2, (r.minZ + r.maxZ) / 2],
      ["south", (r.minX + r.maxX) / 2, r.maxZ + WALL_THICKNESS + size.depth / 2],
    );
    for (const [, x, z] of sides) {
      const candidate: Rect = {
        minX: x - size.width / 2 - HALF_WALL + EPS,
        maxX: x + size.width / 2 + HALF_WALL - EPS,
        minZ: z - size.depth / 2 - HALF_WALL + EPS,
        maxZ: z + size.depth / 2 + HALF_WALL - EPS,
      };
      const clash = rooms.some((o) => {
        const b = roomInteriorRect(o, HALF_WALL);
        return candidate.minX < b.maxX && candidate.maxX > b.minX && candidate.minZ < b.maxZ && candidate.maxZ > b.minZ;
      });
      if (!clash) return { anchorId: anchor.id, positionX: round(x), positionZ: round(z) };
    }
  }
  return null;
}
