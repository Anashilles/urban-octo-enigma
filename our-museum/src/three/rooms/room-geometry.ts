"use client";

/**
 * Builds the static geometry of a room from its data description. Pieces are
 * merged per material so a room costs only a handful of draw calls, and UVs
 * are projected in world metres so textures continue seamlessly across rooms.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  HALF_WALL,
  WALL_KEYS,
  wallLength,
  wallSolidSegments,
  wallTransform,
  type RoomShape,
  type WallKey,
} from "@/features/rooms/geometry";
import type { ResolvedTheme } from "@/features/museums/theme";

export interface RoomBuild {
  floor: THREE.BufferGeometry;
  ceiling: THREE.BufferGeometry;
  walls: THREE.BufferGeometry;
  trim: THREE.BufferGeometry | null;
  wainscot: THREE.BufferGeometry | null;
  dark: THREE.BufferGeometry | null;
  emissive: THREE.BufferGeometry | null;
  threshold: THREE.BufferGeometry | null;
  /** Room-local positions of ceiling light sources (for the light rig). */
  lightPoints: THREE.Vector3[];
  dispose: () => void;
}

const tmpMatrix = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion();
const yAxis = new THREE.Vector3(0, 1, 0);

/** Wall-local → room-local matrix for a wall. */
function wallMatrix(room: RoomShape, wall: WallKey): THREE.Matrix4 {
  const t = wallTransform(room, wall);
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...t.position),
    new THREE.Quaternion().setFromAxisAngle(yAxis, t.rotationY),
    new THREE.Vector3(1, 1, 1),
  );
}

function box(w: number, h: number, d: number, x: number, y: number, z: number, parent?: THREE.Matrix4) {
  const g = new THREE.BoxGeometry(Math.max(w, 1e-4), Math.max(h, 1e-4), Math.max(d, 1e-4));
  tmpMatrix.compose(new THREE.Vector3(x, y, z), tmpQuat.identity(), new THREE.Vector3(1, 1, 1));
  g.applyMatrix4(tmpMatrix);
  if (parent) g.applyMatrix4(parent);
  return g;
}

/** Projects UVs from (room-local + offset) positions, choosing the plane from the normal. */
function projectUVs(g: THREE.BufferGeometry, offsetX: number, offsetZ: number, scale: number) {
  const pos = g.getAttribute("position") as THREE.BufferAttribute;
  const nor = g.getAttribute("normal") as THREE.BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + offsetX;
    const y = pos.getY(i);
    const z = pos.getZ(i) + offsetZ;
    const nx = Math.abs(nor.getX(i));
    const ny = Math.abs(nor.getY(i));
    let u: number;
    let v: number;
    if (ny > 0.5) {
      u = x;
      v = z;
    } else if (nx > 0.5) {
      u = z;
      v = y;
    } else {
      u = x;
      v = y;
    }
    uv[i * 2] = u / scale;
    uv[i * 2 + 1] = v / scale;
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return g;
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (!parts.length) return null;
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

export function buildRoomGeometry(room: RoomShape, theme: ResolvedTheme, floorTile: number): RoomBuild {
  const walls: THREE.BufferGeometry[] = [];
  const trim: THREE.BufferGeometry[] = [];
  const wainscot: THREE.BufferGeometry[] = [];
  const dark: THREE.BufferGeometry[] = [];
  const emissive: THREE.BufferGeometry[] = [];
  const threshold: THREE.BufferGeometry[] = [];
  const h = room.height;
  const baseboardH = theme.baseboard === "tall" ? 0.18 : theme.baseboard === "thin" ? 0.08 : 0;

  for (const key of WALL_KEYS) {
    const m = wallMatrix(room, key);
    const len = wallLength(room, key);
    // The visible inner face is one polygon routed around the doorways, so there
    // are no T-junctions (hairline cracks) where a lintel meets the wall.
    const doors = room.layout.doorways
      .filter((d) => d.wall === key)
      .sort((a, b) => a.offset - b.offset)
      .map((d) => ({ a: Math.max(-len / 2, d.offset - d.width / 2), b: Math.min(len / 2, d.offset + d.width / 2), h: Math.min(d.height, h - 0.01), d }));
    const outline = new THREE.Shape();
    outline.moveTo(-len / 2, 0);
    for (const d of doors) {
      outline.lineTo(d.a, 0);
      outline.lineTo(d.a, d.h);
      outline.lineTo(d.b, d.h);
      outline.lineTo(d.b, 0);
    }
    outline.lineTo(len / 2, 0);
    outline.lineTo(len / 2, h);
    outline.lineTo(-len / 2, h);
    outline.closePath();
    const face = new THREE.ShapeGeometry(outline);
    face.applyMatrix4(m);
    walls.push(face);
    for (const d of doors) {
      // Reveals (jambs and soffit) — this room's half of the wall thickness.
      walls.push(box(0.002, d.h, HALF_WALL, d.a - 0.001, d.h / 2, -HALF_WALL / 2, m));
      walls.push(box(0.002, d.h, HALF_WALL, d.b + 0.001, d.h / 2, -HALF_WALL / 2, m));
      walls.push(box(d.b - d.a, 0.002, HALF_WALL, (d.a + d.b) / 2, d.h + 0.001, -HALF_WALL / 2, m));
      // Architrave around the opening (room side).
      const t = 0.1;
      trim.push(box(d.b - d.a + 2 * t, t, 0.035, (d.a + d.b) / 2, d.h + t / 2, 0.0175, m));
      trim.push(box(t, d.h, 0.035, d.a - t / 2, d.h / 2, 0.0175, m));
      trim.push(box(t, d.h, 0.035, d.b + t / 2, d.h / 2, 0.0175, m));
      threshold.push(box(d.b - d.a, 0.012, HALF_WALL, (d.a + d.b) / 2, 0.006, -HALF_WALL / 2, m));
    }
    for (const seg of wallSolidSegments(room, key)) {
      const lintel = Boolean(seg.doorAbove);
      // Trim pieces are clipped to the visible interior length.
      const a = Math.max(seg.from, -len / 2);
      const b = Math.min(seg.to, len / 2);
      const tw = b - a;
      if (tw <= 0.01) continue;
      const tc = (a + b) / 2;
      if (theme.crownMolding && (!lintel || h - (seg.doorAbove?.height ?? 0) > 0.3)) trim.push(box(tw, 0.14, 0.06, tc, h - 0.07, 0.03, m));
      if (lintel) continue;
      if (baseboardH > 0) trim.push(box(tw, baseboardH, 0.022, tc, baseboardH / 2, 0.011, m));
      if (theme.wainscot) {
        wainscot.push(box(tw, 0.92, 0.016, tc, baseboardH + 0.46, 0.008, m));
        trim.push(box(tw, 0.05, 0.036, tc, baseboardH + 0.94, 0.018, m));
      }
    }
  }

  // Ceiling details.
  const lightPoints: THREE.Vector3[] = [];
  const long = Math.max(room.width, room.depth);
  const alongX = room.width >= room.depth;
  const style = theme.ceilingStyle;
  const skylight = room.layout.skylight || style === "skylights";
  if (skylight) {
    const strips = room.layout.skylight ? 2 : 1;
    const short = Math.min(room.width, room.depth);
    const sw = room.layout.skylight ? short * 0.18 : short * 0.3;
    const sl = long * (room.layout.skylight ? 0.78 : 0.5);
    for (let i = 0; i < strips; i++) {
      const off = strips === 1 ? 0 : (i === 0 ? -1 : 1) * short * 0.22;
      const [w, d] = alongX ? [sl, sw] : [sw, sl];
      const [x, z] = alongX ? [0, off] : [off, 0];
      emissive.push(box(w, 0.01, d, x, h - 0.006, z));
      trim.push(box(w + 0.12, 0.06, 0.06, x, h - 0.03, z - d / 2 - 0.03));
      trim.push(box(w + 0.12, 0.06, 0.06, x, h - 0.03, z + d / 2 + 0.03));
      trim.push(box(0.06, 0.06, d, x - w / 2 - 0.03, h - 0.03, z));
      trim.push(box(0.06, 0.06, d, x + w / 2 + 0.03, h - 0.03, z));
    }
  }
  if (style === "coffered") {
    const step = 2.4;
    for (let x = -room.width / 2 + step; x < room.width / 2 - 0.5; x += step) trim.push(box(0.16, 0.2, room.depth, x, h - 0.1, 0));
    for (let z = -room.depth / 2 + step; z < room.depth / 2 - 0.5; z += step) trim.push(box(room.width, 0.2, 0.16, 0, h - 0.1, z));
    // Pendant glow discs between beams.
    emissive.push(box(0.5, 0.02, 0.5, 0, h - 0.21, 0));
  }
  if (style === "tracks") {
    const offs = [-0.25, 0.25].map((f) => f * Math.min(room.width, room.depth));
    for (const o of offs) {
      const [w, d, x, z] = alongX ? [long * 0.85, 0.05, 0, o] : [0.05, long * 0.85, o, 0];
      dark.push(box(w, 0.04, d, x, h - 0.02, z));
      for (let s = -long * 0.4; s <= long * 0.4 + 1e-6; s += 1.6) {
        const [hx, hz] = alongX ? [s, o] : [o, s];
        dark.push(box(0.09, 0.16, 0.09, hx, h - 0.12, hz));
        emissive.push(box(0.06, 0.01, 0.06, hx, h - 0.205, hz));
      }
    }
  }
  if (style === "flat") {
    const step = 2.6;
    const nx = Math.max(1, Math.floor(room.width / step));
    const nz = Math.max(1, Math.floor(room.depth / step));
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        const x = -room.width / 2 + (room.width / nx) * (i + 0.5);
        const z = -room.depth / 2 + (room.depth / nz) * (j + 0.5);
        emissive.push(box(0.16, 0.01, 0.16, x, h - 0.006, z));
      }
    }
  }
  lightPoints.push(...roomLightPointsLocal(room));

  // Floor and ceiling extend under the walls so neighbouring rooms meet at the wall centre line.
  const floor = new THREE.PlaneGeometry(room.width + 2 * HALF_WALL, room.depth + 2 * HALF_WALL);
  floor.rotateX(-Math.PI / 2);
  projectUVs(floor, room.positionX, room.positionZ, floorTile);
  const ceiling = new THREE.PlaneGeometry(room.width + 2 * HALF_WALL, room.depth + 2 * HALF_WALL);
  ceiling.rotateX(Math.PI / 2);
  ceiling.translate(0, h, 0);

  const wallsGeo = merge(walls)!;
  projectUVs(wallsGeo, room.positionX, room.positionZ, 3);
  const wainscotGeo = merge(wainscot);
  if (wainscotGeo) projectUVs(wainscotGeo, room.positionX, room.positionZ, 1.2);
  const build: RoomBuild = {
    floor,
    ceiling,
    walls: wallsGeo,
    trim: merge(trim),
    wainscot: wainscotGeo,
    dark: merge(dark),
    emissive: merge(emissive),
    threshold: merge(threshold),
    lightPoints,
    dispose: () => {
      for (const g of [build.floor, build.ceiling, build.walls, build.trim, build.wainscot, build.dark, build.emissive, build.threshold]) g?.dispose();
    },
  };
  return build;
}

/** Room-local ceiling light positions: one per room, two along long rooms. */
export function roomLightPointsLocal(room: RoomShape): THREE.Vector3[] {
  const h = room.height;
  const long = Math.max(room.width, room.depth);
  const alongX = room.width >= room.depth;
  if (long <= 12) return [new THREE.Vector3(0, h - 0.6, 0)];
  const o = long / 4;
  return [
    new THREE.Vector3(alongX ? -o : 0, h - 0.6, alongX ? 0 : -o),
    new THREE.Vector3(alongX ? o : 0, h - 0.6, alongX ? 0 : o),
  ];
}

/** Stable signature of everything that affects a room's geometry (for memoisation). */
export function roomSignature(room: RoomShape): string {
  return JSON.stringify([room.width, room.depth, room.height, room.positionX, room.positionZ, room.rotation, room.layout.doorways, room.layout.skylight]);
}
