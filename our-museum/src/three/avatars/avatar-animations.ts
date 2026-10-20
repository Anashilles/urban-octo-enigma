import * as THREE from "three";
import { HIP_HEIGHT, JOINTS, type JointName } from "./avatar-builder";

/**
 * Hand-authored procedural animation clips for the avatar rig. Clips are
 * sampled from small pose functions into quaternion keyframes so they can be
 * mixed with THREE.AnimationMixer (cross-fades, weights, one-shots).
 *
 * Sign conventions (figure faces +Z, left = +X):
 *  - thigh/upper arm x < 0 swings the limb forward
 *  - shin x > 0 bends the knee, forearm x < 0 bends the elbow
 *  - left arm z > 0 / right arm z < 0 lifts the arm sideways
 */

export type ClipName = "idle" | "walk" | "run" | "turn" | "wave";
type Euler3 = [number, number, number];
type Pose = Partial<Record<JointName, Euler3>> & { hipsY?: number };

const TAU = Math.PI * 2;

const REST: Partial<Record<JointName, Euler3>> = {
  upperArmL: [0, 0, 0.07],
  upperArmR: [0, 0, -0.07],
  forearmL: [-0.12, 0, 0],
  forearmR: [-0.12, 0, 0],
};

function sampleClip(name: ClipName, duration: number, samples: number, pose: (p: number) => Pose, joints: readonly JointName[] = JOINTS, loop = true) {
  const times: number[] = [];
  const values = new Map<JointName, number[]>();
  const hips: number[] = [];
  let usesHips = false;
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const count = loop ? samples + 1 : samples;
  for (let i = 0; i < count; i++) {
    // Looping clips repeat the first sample at the end for a seamless cycle.
    const p = loop ? (i % samples) / samples : i / (samples - 1);
    times.push((loop ? i / samples : p) * duration);
    const pose_ = pose(p);
    for (const j of joints) {
      const r = pose_[j] ?? REST[j] ?? [0, 0, 0];
      q.setFromEuler(e.set(r[0], r[1], r[2], "XYZ"));
      let arr = values.get(j);
      if (!arr) values.set(j, (arr = []));
      // Keep consecutive quaternions in the same hemisphere for smooth slerps.
      if (arr.length >= 4) {
        const n = arr.length;
        const dot = arr[n - 4]! * q.x + arr[n - 3]! * q.y + arr[n - 2]! * q.z + arr[n - 1]! * q.w;
        if (dot < 0) q.set(-q.x, -q.y, -q.z, -q.w);
      }
      arr.push(q.x, q.y, q.z, q.w);
    }
    if (pose_.hipsY !== undefined) usesHips = true;
    hips.push(0, HIP_HEIGHT + (pose_.hipsY ?? 0), 0);
  }
  const tracks: THREE.KeyframeTrack[] = [...values.entries()].map(([j, v]) => new THREE.QuaternionKeyframeTrack(`${j}.quaternion`, times, v));
  if (usesHips) tracks.push(new THREE.VectorKeyframeTrack("hips.position", times, hips));
  return new THREE.AnimationClip(name, duration, tracks);
}

const pos = (x: number) => Math.max(0, x);

function idle(p: number): Pose {
  const s = Math.sin(TAU * p);
  const s2 = Math.sin(TAU * p * 2);
  return {
    hipsY: -0.004 + 0.003 * s2,
    spine: [0.02 + 0.008 * s2, 0, 0],
    chest: [0.012 * s2, 0.02 * s, 0],
    neck: [0.01, 0.06 * s, 0],
    head: [0.02 + 0.015 * Math.sin(TAU * p + 1), 0.08 * Math.sin(TAU * p + 0.6), 0.01 * s],
    upperArmL: [0.02 * s, 0, 0.08 + 0.012 * s2],
    upperArmR: [-0.02 * s, 0, -0.08 - 0.012 * s2],
    forearmL: [-0.14, 0, 0],
    forearmR: [-0.14, 0, 0],
    thighL: [-0.02, 0, 0.02],
    thighR: [0.0, 0, -0.03],
    shinL: [0.04, 0, 0],
    shinR: [0.02, 0, 0],
    footL: [-0.02, 0, 0],
    footR: [-0.02, 0, 0],
  };
}

function gait(p: number, k: { stride: number; knee: number; arm: number; elbow: number; lean: number; bob: number; twist: number }): Pose {
  const s = Math.sin(TAU * p);
  const c = Math.cos(TAU * p);
  const thighL = -k.stride * s;
  const thighR = k.stride * s;
  // The knee bends most while the leg swings forward.
  const kneeL = 0.08 + k.knee * Math.pow(pos(c), 1.4);
  const kneeR = 0.08 + k.knee * Math.pow(pos(-c), 1.4);
  return {
    hipsY: k.bob * Math.cos(TAU * p * 2) - k.bob,
    hips: [0, k.twist * s, 0],
    spine: [k.lean, -k.twist * 0.5 * s, 0],
    chest: [k.lean * 0.4, -k.twist * 0.9 * s, 0],
    neck: [0, k.twist * 0.4 * s, 0],
    head: [-k.lean * 0.8, k.twist * 0.3 * s, 0],
    thighL: [thighL, 0, 0.01],
    thighR: [thighR, 0, -0.01],
    shinL: [kneeL, 0, 0],
    shinR: [kneeR, 0, 0],
    footL: [-(thighL + kneeL) * 0.6 + 0.12 * pos(-s), 0, 0],
    footR: [-(thighR + kneeR) * 0.6 + 0.12 * pos(s), 0, 0],
    upperArmL: [k.arm * s, 0, 0.09],
    upperArmR: [-k.arm * s, 0, -0.09],
    forearmL: [-k.elbow - 0.25 * k.elbow * pos(-s), 0, 0],
    forearmR: [-k.elbow - 0.25 * k.elbow * pos(s), 0, 0],
  };
}

function turnStep(p: number): Pose {
  const s = Math.sin(TAU * p);
  const base = idle(0);
  return {
    ...base,
    hipsY: -0.008 + 0.006 * Math.abs(s),
    thighL: [-0.22 * pos(s), 0, 0.02],
    thighR: [-0.22 * pos(-s), 0, -0.02],
    shinL: [0.06 + 0.45 * pos(s), 0, 0],
    shinR: [0.06 + 0.45 * pos(-s), 0, 0],
    footL: [-0.1 * pos(s), 0, 0],
    footR: [-0.1 * pos(-s), 0, 0],
  };
}

/** Wave with the right hand: raise, three waves, lower. */
function wave(p: number): Pose {
  const t = p * 2.4;
  const raise = t < 0.4 ? smooth(t / 0.4) : t > 2.0 ? 1 - smooth((t - 2.0) / 0.4) : 1;
  const w = t > 0.35 && t < 2.05 ? Math.sin((t - 0.35) * TAU * 1.75) : 0;
  return {
    shoulderR: [0, 0, -0.08 * raise],
    upperArmR: [-0.25 * raise, 0.2 * raise, -0.07 - 2.45 * raise],
    forearmR: [-0.12 - 0.35 * raise, 0, -0.35 * raise + 0.38 * w * raise],
    handR: [0, 0.1 * raise, 0.1 * w * raise],
    head: [0, -0.1 * raise, -0.04 * raise],
  };
}

function smooth(x: number) {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
}

export const WALK_CYCLE = 1.05; // seconds per stride cycle (two steps)
export const RUN_CYCLE = 0.68;
/** Ground speed (m/s) at which each clip's feet do not slide at timeScale 1. */
export const WALK_REF_SPEED = 1.55;
export const RUN_REF_SPEED = 3.25;

let cache: Record<ClipName, THREE.AnimationClip> | null = null;

/** Shared clips (they only reference joint names, so every avatar can use them). */
export function avatarClips(): Record<ClipName, THREE.AnimationClip> {
  if (cache) return cache;
  cache = {
    idle: sampleClip("idle", 4.2, 24, idle),
    walk: sampleClip("walk", WALK_CYCLE, 24, (p) => gait(p, { stride: 0.5, knee: 0.62, arm: 0.34, elbow: 0.22, lean: 0.03, bob: 0.014, twist: 0.07 })),
    run: sampleClip("run", RUN_CYCLE, 24, (p) => gait(p, { stride: 0.72, knee: 1.25, arm: 0.62, elbow: 1.05, lean: 0.16, bob: 0.03, twist: 0.1 })),
    turn: sampleClip("turn", 0.8, 16, turnStep),
    wave: sampleClip("wave", 2.4, 36, wave, ["shoulderR", "upperArmR", "forearmR", "handR", "head"], false),
  };
  return cache;
}
