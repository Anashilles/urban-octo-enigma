import { describe, expect, it } from "vitest";
import {
  checkPlacement,
  findFreeSpot,
  frameFootprint,
  nearestValidPlacement,
  outerSize,
  sizeForAspect,
  snapPlacement,
  type FramePlacement,
} from "@/features/photo-placement/placement";
import type { PlacementBounds } from "@/features/rooms/geometry";

const wall: PlacementBounds = {
  minU: -3.85,
  maxU: 3.85,
  minV: 0.35,
  maxV: 3.95,
  exclusions: [{ minU: -1.22, maxU: 1.22, minV: 0, maxV: 3.12 }],
};

const base: FramePlacement = { u: 2.4, v: 1.55, width: 0.8, height: 0.6, rotation: 0, style: "minimal-black" };

describe("checkPlacement", () => {
  it("accepts a frame inside the wall bounds", () => {
    expect(checkPlacement(wall, base, [])).toEqual({ ok: true });
  });

  it("rejects frames outside the wall", () => {
    expect(checkPlacement(wall, { ...base, u: 3.7 }, []).problem).toBe("out_of_bounds");
    expect(checkPlacement(wall, { ...base, v: 3.8 }, []).problem).toBe("out_of_bounds");
    expect(checkPlacement(wall, { ...base, v: 0.3 }, []).problem).toBe("out_of_bounds");
  });

  it("rejects frames over a doorway", () => {
    expect(checkPlacement(wall, { ...base, u: 0 }, []).problem).toBe("overlaps_doorway");
  });

  it("rejects overlapping frames unless overlap is explicitly allowed", () => {
    const other = { ...base, id: "f1", u: 2.6 };
    const result = checkPlacement(wall, base, [other]);
    expect(result).toMatchObject({ ok: false, problem: "overlaps_frame", conflicts: ["f1"] });
    expect(checkPlacement(wall, base, [other], { allowOverlap: true })).toMatchObject({ ok: true, conflicts: ["f1"] });
  });

  it("enforces size and tilt limits", () => {
    expect(checkPlacement(wall, { ...base, width: 0.1 }, []).problem).toBe("too_small");
    expect(checkPlacement(wall, { ...base, width: 5 }, []).problem).toBe("too_large");
    expect(checkPlacement(wall, { ...base, rotation: 15 }, []).problem).toBe("rotation_limit");
  });
});

describe("aspect ratio", () => {
  it("preserves the photo aspect ratio for portrait and landscape photos", () => {
    const portrait = sizeForAspect(3 / 4, 0.9);
    expect(portrait.width / portrait.height).toBeCloseTo(0.75, 2);
    const landscape = sizeForAspect(16 / 9, 1.2);
    expect(landscape.width / landscape.height).toBeCloseTo(16 / 9, 2);
  });

  it("fits very tall photos under the maximum height without distortion", () => {
    const tall = sizeForAspect(1 / 4, 1.0);
    expect(tall.height).toBeLessThanOrEqual(2.6);
    expect(tall.width / tall.height).toBeCloseTo(0.25, 2);
  });

  it("adds border and mat around the printed area", () => {
    const o = outerSize({ width: 1, height: 0.5, style: "champagne-gold" });
    expect(o.width).toBeGreaterThan(1);
    expect(o.height).toBeGreaterThan(0.5);
    const polaroid = outerSize({ width: 0.5, height: 0.5, style: "polaroid" });
    expect(polaroid.height - 0.5).toBeGreaterThan(polaroid.width - 0.5);
  });
});

describe("snapping", () => {
  it("snaps to the grid and to eye level", () => {
    const { placement, guides } = snapPlacement({ ...base, u: 2.43, v: 1.6 }, []);
    expect(placement.u).toBeCloseTo(2.45, 5);
    expect(placement.v).toBeCloseTo(1.55, 5);
    expect(guides.v).toBe(1.55);
  });

  it("aligns with a neighbouring frame's centre line", () => {
    const { placement } = snapPlacement({ ...base, v: 1.98 }, [{ ...base, u: -2.5, v: 2.0 }]);
    expect(placement.v).toBeCloseTo(2.0, 5);
  });

  it("moves an invalid candidate to the nearest valid wall position", () => {
    const fixed = nearestValidPlacement(wall, { ...base, u: 1.0 }, [])!;
    expect(fixed).not.toBeNull();
    expect(checkPlacement(wall, fixed, []).ok).toBe(true);
    expect(frameFootprint(fixed).minU).toBeGreaterThanOrEqual(1.22);
  });

  it("finds free spots until the wall is full", () => {
    const placed: Array<FramePlacement & { id: string }> = [];
    for (let i = 0; i < 20; i++) {
      const spot = findFreeSpot(wall, { width: 0.8, height: 0.6, style: "minimal-black" }, placed);
      if (!spot) break;
      expect(checkPlacement(wall, spot, placed).ok).toBe(true);
      placed.push({ ...spot, id: `f${i}` });
    }
    expect(placed.length).toBeGreaterThan(3);
  });
});
