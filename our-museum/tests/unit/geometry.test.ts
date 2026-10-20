import { describe, expect, it } from "vitest";
import {
  collisionBoxes,
  computeWallSpec,
  connectRooms,
  findAttachmentSpot,
  resolveCircleCollisions,
  roomPath,
  segmentHitDistance,
  sharedWall,
  wallPointWorld,
  WALL_THICKNESS,
  type RoomShape,
} from "@/features/rooms/geometry";

function room(id: string, x: number, z: number, w: number, d: number, h = 4): RoomShape {
  return {
    id,
    name: id,
    roomType: "gallery",
    width: w,
    depth: d,
    height: h,
    positionX: x,
    positionZ: z,
    rotation: 0,
    layout: { doorways: [], lighting: {}, decor: [] },
    sortOrder: 0,
  };
}

describe("wall coordinates", () => {
  const r = room("a", 10, -5, 8, 6);
  it("maps u to the right-hand side as seen from inside the room", () => {
    // North wall: facing north (−Z), right is +X.
    expect(wallPointWorld(r, "north", 1)).toMatchObject({ x: 11, z: -8, nx: 0, nz: 1 });
    // South wall: facing south (+Z), right is −X.
    expect(wallPointWorld(r, "south", 1)).toMatchObject({ x: 9, z: -2, nx: 0, nz: -1 });
    // East wall: facing east (+X), right is +Z.
    expect(wallPointWorld(r, "east", 1)).toMatchObject({ x: 14, z: -4, nx: -1, nz: 0 });
    // West wall: facing west (−X), right is −Z.
    expect(wallPointWorld(r, "west", 1)).toMatchObject({ x: 6, z: -6, nx: 1, nz: 0 });
  });
});

describe("connectRooms", () => {
  it("creates matching doorways at the same world position on both sides", () => {
    const a = room("a", 0, 0, 10, 8);
    const b = room("b", 2, -8 - WALL_THICKNESS, 6, 8);
    expect(sharedWall(a, b)).toMatchObject({ wallA: "north", wallB: "south" });
    expect(connectRooms(a, b)).toBe(true);
    const da = a.layout.doorways[0]!;
    const db = b.layout.doorways[0]!;
    const pa = wallPointWorld(a, da.wall, da.offset);
    const pb = wallPointWorld(b, db.wall, db.offset);
    expect(pa.x).toBeCloseTo(pb.x, 3);
    expect(da.connectsTo).toBe("b");
    expect(db.connectsTo).toBe("a");
  });

  it("refuses rooms that do not share a wall", () => {
    expect(connectRooms(room("a", 0, 0, 4, 4), room("b", 20, 0, 4, 4))).toBe(false);
  });

  it("excludes the doorway from the wall's placement bounds", () => {
    const a = room("a", 0, 0, 10, 8);
    const b = room("b", 0, -8 - WALL_THICKNESS, 10, 8);
    connectRooms(a, b);
    const spec = computeWallSpec(a, "north");
    expect(spec.bounds.exclusions).toHaveLength(1);
    expect(spec.bounds.exclusions[0]!.minU).toBeLessThan(0);
    expect(spec.bounds.exclusions[0]!.maxU).toBeGreaterThan(0);
  });
});

describe("collision", () => {
  const a = room("a", 0, 0, 10, 8);
  const b = room("b", 0, -8 - WALL_THICKNESS, 10, 8);
  connectRooms(a, b);
  const boxes = collisionBoxes([a, b]);

  it("stops the player at a wall", () => {
    const [x, z] = resolveCircleCollisions(4.95, 0, 0.3, boxes);
    expect(x).toBeLessThanOrEqual(5 - 0.3 + 1e-6);
    expect(z).toBeCloseTo(0);
  });

  it("lets the player walk through a doorway", () => {
    const [x, z] = resolveCircleCollisions(0, -4.15, 0.3, boxes);
    expect(x).toBeCloseTo(0);
    expect(z).toBeCloseTo(-4.15);
  });

  it("blocks the wall next to the doorway", () => {
    // Approaching the north wall from inside room a, beside the opening.
    const [, z] = resolveCircleCollisions(3.5, -3.85, 0.3, boxes);
    expect(z).toBeCloseTo(-3.7, 5);
  });

  it("measures camera ray hits against walls", () => {
    expect(segmentHitDistance(0, 0, 10, 0, boxes, 0)).toBeCloseTo(5, 3);
    expect(segmentHitDistance(0, 0, 2, 0, boxes, 0)).toBeCloseTo(2, 3);
  });
});

describe("pathfinding and growth", () => {
  it("finds a doorway path between rooms", () => {
    const a = room("a", 0, 0, 10, 8);
    const b = room("b", 0, -8 - WALL_THICKNESS, 10, 8);
    const c = room("c", 10 + WALL_THICKNESS, -8 - WALL_THICKNESS, 10, 8);
    connectRooms(a, b);
    connectRooms(b, c);
    const path = roomPath([a, b, c], "a", "c")!;
    expect(path.map((s) => s.roomId)).toEqual(["b", "c"]);
  });

  it("finds a free attachment spot that does not overlap existing rooms", () => {
    const a = room("a", 0, 0, 10, 8);
    const spot = findAttachmentSpot([a], { width: 6, depth: 6 });
    expect(spot).not.toBeNull();
    const b = room("b", spot!.positionX, spot!.positionZ, 6, 6);
    expect(sharedWall(a, b)).not.toBeNull();
  });
});
