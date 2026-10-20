import { describe, expect, it } from "vitest";
import { buildTemplateRooms, TEMPLATE_IDS, TEMPLATES } from "@/features/museums/templates";
import {
  collisionBoxes,
  computeWallSpecs,
  reachableRooms,
  resolveCircleCollisions,
  roomAt,
  validateLayout,
  PLAYER_RADIUS,
} from "@/features/rooms/geometry";

describe.each(TEMPLATE_IDS)("template %s", (id) => {
  const rooms = buildTemplateRooms(id, (k) => k, (k) => `r-${k}`);

  it("has eight rooms covering every required room type", () => {
    expect(rooms).toHaveLength(8);
    expect(rooms.map((r) => r.key).sort()).toEqual(
      ["couples", "final", "hall", "lobby", "personal", "reflection", "special", "travel"].sort(),
    );
  });

  it("produces a valid, non-overlapping layout with paired doorways", () => {
    expect(validateLayout(rooms)).toEqual([]);
  });

  it("connects every room to the lobby", () => {
    const lobby = rooms.find((r) => r.key === "lobby")!;
    expect(reachableRooms(rooms, lobby.id).size).toBe(rooms.length);
  });

  it("spawns the visitor inside the lobby, clear of walls and decor", () => {
    const { spawn } = TEMPLATES[id];
    expect(roomAt(rooms, spawn.x, spawn.z)?.id).toBe("r-lobby");
    const [x, z] = resolveCircleCollisions(spawn.x, spawn.z, PLAYER_RADIUS, collisionBoxes(rooms));
    expect(x).toBeCloseTo(spawn.x, 6);
    expect(z).toBeCloseTo(spawn.z, 6);
  });

  it("leaves usable hanging space on the walls of every room", () => {
    for (const room of rooms) {
      const usable = computeWallSpecs(room).filter((w) => w.bounds.maxU - w.bounds.minU > 1.5);
      expect(usable.length, room.key).toBeGreaterThanOrEqual(2);
    }
  });
});
