import { beforeEach, describe, expect, it } from "vitest";
import { INTERPOLATION_DELAY_MS, clearPoses, forgetPeer, latestPose, pushPose, samplePose } from "@/features/realtime/remote-poses";
import { FacingTracker, angleDelta } from "@/three/avatars/facing";

describe("remote pose interpolation", () => {
  beforeEach(clearPoses);

  it("draws remote visitors slightly in the past, between samples", () => {
    pushPose(["p", 0, 0, 0, 0, 1, 0, null], 1000);
    pushPose(["p", 1, 2, 0.5, 0, 1, 0, null], 1100);
    const mid = samplePose("p", 1050 + INTERPOLATION_DELAY_MS)!;
    expect(mid.x).toBeCloseTo(0.5);
    expect(mid.z).toBeCloseTo(1);
    expect(mid.yaw).toBeCloseTo(0.25);
    // Before the first sample: hold it; after the last: hold the last.
    expect(samplePose("p", 0)!.x).toBe(0);
    expect(samplePose("p", 5000)!.x).toBe(1);
    expect(samplePose("missing", 1000)).toBeNull();
  });

  it("turns the short way round when yaw wraps", () => {
    pushPose(["p", 0, 0, 3.1, 0, 0, 0, null], 0);
    pushPose(["p", 0, 0, -3.1, 0, 0, 0, null], 100);
    const yaw = samplePose("p", 50 + INTERPOLATION_DELAY_MS)!.yaw;
    expect(Math.abs(Math.abs(yaw) - Math.PI)).toBeLessThan(0.05);
  });

  it("snaps on teleports instead of sliding through walls", () => {
    pushPose(["p", 0, 0, 0, 0, 0, 0, null], 0);
    pushPose(["p", 20, 0, 0, 0, 0, 0, null], 100);
    expect(samplePose("p", 50 + INTERPOLATION_DELAY_MS)!.x).toBe(20);
    forgetPeer("p");
    expect(latestPose("p")).toBeNull();
  });
});

describe("avatar facing", () => {
  it("faces the direction of travel and turns to the view when standing", () => {
    const f = new FacingTracker();
    f.update(0, 0, 0, 1 / 60);
    for (let i = 1; i <= 120; i++) f.update(i * 0.03, 0, 0, 1 / 60); // walking along +X
    expect(Math.abs(angleDelta(f.facing, Math.PI / 2))).toBeLessThan(0.05);
    expect(f.speed).toBeGreaterThan(1.5);
    // Standing still: a small glance does not turn the body...
    for (let i = 0; i < 120; i++) f.update(3.6, 0, Math.PI, 1 / 60);
    expect(Math.abs(angleDelta(f.facing, Math.PI / 2))).toBeLessThan(0.05);
    // ...but looking right round does (camera yaw π/2 looks along -X).
    for (let i = 0; i < 240; i++) f.update(3.6, 0, Math.PI / 2, 1 / 60);
    expect(Math.abs(angleDelta(f.facing, -Math.PI / 2))).toBeLessThan(0.05);
  });
});
