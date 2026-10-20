/**
 * Museum templates. Each template is a different piece of architecture
 * (floor plan, proportions, ceiling heights), lighting, finishes and default
 * frames — not just a colour swap. Room positions satisfy the layout engine's
 * adjacency rule (walls exactly WALL_THICKNESS apart) and are verified by
 * tests/unit/templates.test.ts.
 */
import {
  connectRooms,
  type RoomDecor,
  type RoomLayoutConfig,
  type RoomShape,
  type RoomType,
} from "@/features/rooms/geometry";
import type { ResolvedTheme } from "./theme";

export const TEMPLATE_IDS = ["minimal-white", "warm-romantic", "modern-contemporary", "dark-luxury"] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

export const ROOM_KEYS = ["lobby", "hall", "personal", "couples", "travel", "special", "reflection", "final"] as const;
export type RoomKey = (typeof ROOM_KEYS)[number];

interface RoomSeed {
  key: RoomKey;
  roomType: RoomType;
  w: number;
  d: number;
  h: number;
  x: number;
  z: number;
  skylight?: boolean;
  decor?: Array<Omit<RoomDecor, "id">>;
}

export interface MuseumTemplate {
  id: TemplateId;
  theme: ResolvedTheme;
  rooms: RoomSeed[];
  connections: Array<[RoomKey, RoomKey]>;
  /** Spawn point in the lobby (world space) and initial yaw (radians, 0 = facing north). */
  spawn: { x: number; z: number; yaw: number };
}

const bench = (x: number, z: number, rotation = 0): Omit<RoomDecor, "id"> => ({ type: "bench", x, z, rotation });
const pedestal = (x: number, z: number): Omit<RoomDecor, "id"> => ({ type: "pedestal", x, z, rotation: 0 });
const plant = (x: number, z: number): Omit<RoomDecor, "id"> => ({ type: "plant", x, z, rotation: 0 });
const sculpture = (x: number, z: number): Omit<RoomDecor, "id"> => ({ type: "sculpture", x, z, rotation: 0 });

export const TEMPLATES: Record<TemplateId, MuseumTemplate> = {
  // Bright enfilade: a lofty skylit hall with four side galleries.
  "minimal-white": {
    id: "minimal-white",
    theme: {
      wallColor: "#f3f1ec",
      accentWallColor: "#e9e6df",
      trimColor: "#ebe8e2",
      trimMetallic: false,
      ceilingColor: "#fbfaf8",
      floorMaterial: "oak",
      lightingPreset: "gallery",
      defaultFrameStyle: "minimal-black",
      defaultMatColor: "#fbfaf7",
      wainscot: false,
      crownMolding: false,
      baseboard: "thin",
      ceilingStyle: "skylights",
      plasterTexture: false,
    },
    rooms: [
      { key: "lobby", roomType: "lobby", w: 10, d: 7, h: 4.2, x: 0, z: 0, decor: [pedestal(-3.6, -1.6), pedestal(3.6, -1.6)] },
      { key: "hall", roomType: "hall", w: 10, d: 16, h: 5.6, x: 0, z: -11.8, skylight: true, decor: [bench(0, -3.5), bench(0, 3.5)] },
      { key: "personal", roomType: "gallery", w: 8, d: 7.85, h: 4.2, x: -9.3, z: -7.725, decor: [bench(0, 0, 90)] },
      { key: "couples", roomType: "gallery", w: 8, d: 7.85, h: 4.2, x: -9.3, z: -15.875, decor: [bench(0, 0, 90)] },
      { key: "travel", roomType: "gallery", w: 8, d: 7.85, h: 4.2, x: 9.3, z: -7.725, decor: [bench(0, 0, 90)] },
      { key: "special", roomType: "special", w: 8, d: 7.85, h: 4.2, x: 9.3, z: -15.875, decor: [sculpture(0, 0)] },
      { key: "reflection", roomType: "reflection", w: 7, d: 6, h: 3.6, x: 0, z: -23.1, decor: [bench(0, 0.8)] },
      { key: "final", roomType: "custom", w: 6, d: 6, h: 3.6, x: -6.8, z: -23.1 },
    ],
    connections: [
      ["lobby", "hall"],
      ["hall", "personal"],
      ["hall", "couples"],
      ["hall", "travel"],
      ["hall", "special"],
      ["hall", "reflection"],
      ["reflection", "final"],
      ["personal", "couples"],
      ["travel", "special"],
    ],
    spawn: { x: 0, z: 2.2, yaw: 0 },
  },

  // Intimate salons around a square central hall; walnut wainscoting, warm amber light.
  "warm-romantic": {
    id: "warm-romantic",
    theme: {
      wallColor: "#eadfcd",
      accentWallColor: "#d9c4a5",
      trimColor: "#4a3628",
      trimMetallic: false,
      ceilingColor: "#f3eadc",
      floorMaterial: "walnut-herringbone",
      lightingPreset: "warm",
      defaultFrameStyle: "champagne-gold",
      defaultMatColor: "#f2ebdc",
      wainscot: true,
      crownMolding: true,
      baseboard: "tall",
      ceilingStyle: "coffered",
      plasterTexture: true,
    },
    rooms: [
      { key: "lobby", roomType: "lobby", w: 8, d: 6, h: 3.8, x: 0, z: 0, decor: [plant(-3.2, -2.2), plant(3.2, -2.2)] },
      { key: "hall", roomType: "hall", w: 14, d: 14, h: 5.2, x: 0, z: -10.3, decor: [bench(0, 0), plant(-6, -6), plant(6, -6)] },
      { key: "personal", roomType: "gallery", w: 9, d: 7, h: 4.2, x: -11.8, z: -10.3, decor: [bench(0, 0, 90)] },
      { key: "couples", roomType: "gallery", w: 10, d: 9, h: 4.6, x: 0, z: -22.1, decor: [bench(0, 1)] },
      { key: "travel", roomType: "gallery", w: 9, d: 7, h: 4.2, x: 11.8, z: -10.3, decor: [bench(0, 0, 90)] },
      { key: "special", roomType: "special", w: 9, d: 7, h: 4.2, x: -11.8, z: -17.6, decor: [pedestal(0, 0)] },
      { key: "reflection", roomType: "reflection", w: 7, d: 6, h: 3.8, x: 10.8, z: -17.1, decor: [bench(0, 0.5)] },
      { key: "final", roomType: "custom", w: 8, d: 6, h: 3.6, x: 0, z: -29.9 },
    ],
    connections: [
      ["lobby", "hall"],
      ["hall", "personal"],
      ["hall", "travel"],
      ["hall", "couples"],
      ["personal", "special"],
      ["travel", "reflection"],
      ["couples", "final"],
    ],
    spawn: { x: 0, z: 1.6, yaw: 0 },
  },

  // Open plan with offset concrete volumes, wide openings and track lighting.
  "modern-contemporary": {
    id: "modern-contemporary",
    theme: {
      wallColor: "#e7e6e3",
      accentWallColor: "#bdbab4",
      trimColor: "#d8d6d1",
      trimMetallic: false,
      ceilingColor: "#2c2d2f",
      floorMaterial: "concrete",
      lightingPreset: "cool",
      defaultFrameStyle: "frameless-canvas",
      defaultMatColor: "#ffffff",
      wainscot: false,
      crownMolding: false,
      baseboard: "none",
      ceilingStyle: "tracks",
      plasterTexture: true,
    },
    rooms: [
      { key: "lobby", roomType: "lobby", w: 12, d: 6, h: 4.5, x: 0, z: 0, decor: [sculpture(-3.8, -0.6)] },
      { key: "hall", roomType: "hall", w: 20, d: 12, h: 6.5, x: 3, z: -9.3, decor: [bench(-2, 0), bench(6, 0)] },
      { key: "personal", roomType: "gallery", w: 8, d: 8, h: 4.8, x: -3, z: -19.6 },
      { key: "couples", roomType: "gallery", w: 11.7, d: 8, h: 4.8, x: 7.15, z: -19.6, decor: [bench(0, 0)] },
      { key: "travel", roomType: "corridor", w: 9, d: 12, h: 5.2, x: -11.8, z: -9.3, decor: [bench(0, 0, 90)] },
      { key: "special", roomType: "special", w: 6, d: 7, h: 4.5, x: -9.3, z: 0.5, decor: [pedestal(0, 0)] },
      { key: "reflection", roomType: "reflection", w: 6.4, d: 6, h: 4.0, x: 9.5, z: 0, decor: [bench(0, 0.6)] },
      { key: "final", roomType: "custom", w: 8, d: 6, h: 4.2, x: 7, z: -26.9 },
    ],
    connections: [
      ["lobby", "hall"],
      ["hall", "personal"],
      ["hall", "couples"],
      ["personal", "couples"],
      ["hall", "travel"],
      ["travel", "special"],
      ["special", "lobby"],
      ["lobby", "reflection"],
      ["couples", "final"],
    ],
    spawn: { x: 0, z: 1.8, yaw: 0 },
  },

  // A long dark gallery spine with jewel-box rooms and dramatic picture lights.
  "dark-luxury": {
    id: "dark-luxury",
    theme: {
      wallColor: "#2a2826",
      accentWallColor: "#1f2421",
      trimColor: "#8c7344",
      trimMetallic: true,
      ceilingColor: "#121110",
      floorMaterial: "marble-black",
      lightingPreset: "dramatic",
      defaultFrameStyle: "champagne-gold",
      defaultMatColor: "#141312",
      wainscot: false,
      crownMolding: true,
      baseboard: "tall",
      ceilingStyle: "flat",
      plasterTexture: true,
    },
    rooms: [
      { key: "lobby", roomType: "lobby", w: 8, d: 8, h: 4.5, x: 0, z: 0, decor: [sculpture(-2.4, -1.2)] },
      { key: "hall", roomType: "corridor", w: 5, d: 22, h: 4.8, x: 0, z: -15.3, decor: [bench(0, -5), bench(0, 5)] },
      { key: "personal", roomType: "gallery", w: 8, d: 8, h: 4.2, x: -6.8, z: -9.3, decor: [bench(0, 0)] },
      { key: "couples", roomType: "gallery", w: 8, d: 8, h: 4.2, x: -6.8, z: -17.6, decor: [bench(0, 0)] },
      { key: "travel", roomType: "gallery", w: 8, d: 8, h: 4.2, x: 6.8, z: -9.3, decor: [bench(0, 0)] },
      { key: "special", roomType: "special", w: 8, d: 8, h: 4.2, x: 6.8, z: -17.6, decor: [pedestal(0, 0)] },
      { key: "reflection", roomType: "reflection", w: 9, d: 7, h: 4.0, x: 0, z: -30.1, decor: [bench(0, 1)] },
      { key: "final", roomType: "custom", w: 6, d: 7, h: 4.0, x: -7.8, z: -30.1 },
    ],
    connections: [
      ["lobby", "hall"],
      ["hall", "personal"],
      ["hall", "couples"],
      ["hall", "travel"],
      ["hall", "special"],
      ["hall", "reflection"],
      ["reflection", "final"],
      ["personal", "couples"],
    ],
    spawn: { x: 0, z: 2.8, yaw: 0 },
  },
};

export function isTemplateId(value: unknown): value is TemplateId {
  return typeof value === "string" && (TEMPLATE_IDS as readonly string[]).includes(value);
}

export function getTemplate(id: string): MuseumTemplate {
  return isTemplateId(id) ? TEMPLATES[id] : TEMPLATES["minimal-white"];
}

/**
 * Instantiates a template's rooms with ids from `makeId`, wires doorways for its
 * connections and returns plain room shapes ready to persist.
 */
export function buildTemplateRooms(
  templateId: TemplateId,
  nameFor: (key: RoomKey) => string,
  makeId: (key: RoomKey) => string,
): Array<RoomShape & { key: RoomKey }> {
  const template = TEMPLATES[templateId];
  const rooms = template.rooms.map((seed, index) => {
    const id = makeId(seed.key);
    const layout: RoomLayoutConfig = {
      doorways: [],
      lighting: {},
      decor: (seed.decor ?? []).map((d, i) => ({ ...d, id: `${seed.key}-decor-${i}` })),
      ...(seed.skylight ? { skylight: true } : {}),
    };
    return {
      key: seed.key,
      id,
      name: nameFor(seed.key),
      roomType: seed.roomType,
      width: seed.w,
      depth: seed.d,
      height: seed.h,
      positionX: seed.x,
      positionZ: seed.z,
      rotation: 0,
      layout,
      sortOrder: index,
    };
  });
  const byKey = new Map(rooms.map((r) => [r.key, r]));
  for (const [a, b] of template.connections) {
    const ra = byKey.get(a)!;
    const rb = byKey.get(b)!;
    const wide = templateId === "modern-contemporary" && (a === "lobby" || a === "hall");
    if (!connectRooms(ra, rb, wide ? { width: 3.6, height: 3.4 } : {})) {
      throw new Error(`Template ${templateId}: rooms ${a} and ${b} are not adjacent`);
    }
  }
  return rooms;
}
