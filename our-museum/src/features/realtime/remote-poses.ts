import type { PoseTuple } from "./protocol";

/**
 * Pose buffers for remote visitors, kept outside React. Avatars are drawn a
 * little in the past (INTERPOLATION_DELAY) and interpolated between the two
 * surrounding samples, which hides network jitter at ~12 updates per second.
 */
export interface PoseSample {
  t: number;
  x: number;
  z: number;
  yaw: number;
  pitch: number;
  speed: number;
  running: boolean;
  room: string | null;
}

export const INTERPOLATION_DELAY_MS = 140;
const MAX_SAMPLES = 24;
const TELEPORT_DISTANCE = 4;

const buffers = new Map<string, PoseSample[]>();

export function pushPose(tuple: PoseTuple, receivedAt = performance.now()) {
  const [id, x, z, yaw, pitch, speed, running, room] = tuple;
  let buf = buffers.get(id);
  if (!buf) buffers.set(id, (buf = []));
  const last = buf[buf.length - 1];
  // Long jumps (teleports, "go to photo") snap instead of sliding through walls.
  if (last && Math.hypot(x - last.x, z - last.z) > TELEPORT_DISTANCE) buf.length = 0;
  buf.push({ t: receivedAt, x, z, yaw, pitch, speed, running: running === 1, room });
  if (buf.length > MAX_SAMPLES) buf.splice(0, buf.length - MAX_SAMPLES);
}

export function forgetPeer(id: string) {
  buffers.delete(id);
}

export function clearPoses() {
  buffers.clear();
}

export function latestPose(id: string): PoseSample | null {
  const buf = buffers.get(id);
  return buf?.[buf.length - 1] ?? null;
}

function lerpAngle(a: number, b: number, t: number) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/** The interpolated pose to draw at `now`, or null before the first update. */
export function samplePose(id: string, now = performance.now()): PoseSample | null {
  const buf = buffers.get(id);
  if (!buf || buf.length === 0) return null;
  const t = now - INTERPOLATION_DELAY_MS;
  if (t <= buf[0]!.t) return buf[0]!;
  for (let i = buf.length - 1; i > 0; i--) {
    const a = buf[i - 1]!;
    const b = buf[i]!;
    if (t >= a.t) {
      if (t >= b.t) return b;
      const k = (t - a.t) / Math.max(1, b.t - a.t);
      return {
        t,
        x: a.x + (b.x - a.x) * k,
        z: a.z + (b.z - a.z) * k,
        yaw: lerpAngle(a.yaw, b.yaw, k),
        pitch: a.pitch + (b.pitch - a.pitch) * k,
        speed: a.speed + (b.speed - a.speed) * k,
        running: b.running,
        room: b.room,
      };
    }
  }
  return buf[buf.length - 1]!;
}

/** Gestures from other visitors, delivered to their avatar components. */
const gestureTarget: EventTarget | null = typeof window !== "undefined" ? new EventTarget() : null;

export function emitRemoteGesture(peerId: string, gesture: "wave") {
  gestureTarget?.dispatchEvent(new CustomEvent("gesture", { detail: { peerId, gesture } }));
}

export function onRemoteGesture(fn: (peerId: string, gesture: "wave") => void): () => void {
  const handler = (e: Event) => {
    const d = (e as CustomEvent<{ peerId: string; gesture: "wave" }>).detail;
    fn(d.peerId, d.gesture);
  };
  gestureTarget?.addEventListener("gesture", handler);
  return () => gestureTarget?.removeEventListener("gesture", handler);
}
