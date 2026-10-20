/** Shortest signed angle from a to b. */
export function angleDelta(a: number, b: number) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Works out which way an avatar's body faces from its movement: towards the
 * direction of travel while walking; when standing, it turns to where the
 * visitor is looking once they look far enough away. Also measures ground
 * speed from positions, which covers glides and teleports.
 */
export class FacingTracker {
  facing: number;
  speed = 0;
  turnRate = 0;
  private x = 0;
  private z = 0;
  private init = false;
  private turning = false;

  constructor(initialFacing = 0) {
    this.facing = initialFacing;
  }

  /** `yaw` is the camera yaw (0 looks along -Z); the model faces +Z. */
  update(x: number, z: number, yaw: number, rawDt: number) {
    const dt = Math.max(1e-3, Math.min(rawDt, 0.1));
    let dx = x - this.x;
    let dz = z - this.z;
    const heading = yaw + Math.PI;
    if (!this.init || dx * dx + dz * dz > 1.5 * 1.5) {
      dx = 0;
      dz = 0;
      this.init = true;
      this.facing = heading;
    }
    this.x = x;
    this.z = z;
    const measured = Math.hypot(dx, dz) / dt;
    this.speed += (measured - this.speed) * (1 - Math.exp(-12 * dt));
    let target = this.facing;
    if (this.speed > 0.25 && measured > 0.05) {
      target = Math.atan2(dx, dz);
      this.turning = false;
    } else {
      // Standing: once the view swings far enough, turn all the way to it.
      const off = Math.abs(angleDelta(this.facing, heading));
      if (off > 1.9) this.turning = true;
      else if (off < 0.05) this.turning = false;
      if (this.turning) target = heading;
    }
    const turn = angleDelta(this.facing, target) * (1 - Math.exp(-(this.speed > 0.25 ? 11 : 5) * dt));
    this.facing += turn;
    this.turnRate = turn / dt;
  }
}
