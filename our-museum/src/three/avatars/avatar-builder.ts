import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { AvatarConfig, BodyType } from "@/features/avatars/config";

/**
 * Builds an original, stylised humanoid from primitives on a joint hierarchy
 * ("rig"). Each joint is a named Object3D that animation clips rotate; the
 * body parts attached to a joint are merged per material so a whole avatar
 * costs roughly 25 draw calls.
 *
 * The figure faces +Z with its left side on +X. Units are metres; the root
 * sits on the floor.
 */

export const JOINTS = [
  "hips",
  "spine",
  "chest",
  "neck",
  "head",
  "shoulderL",
  "upperArmL",
  "forearmL",
  "handL",
  "shoulderR",
  "upperArmR",
  "forearmR",
  "handR",
  "thighL",
  "shinL",
  "footL",
  "thighR",
  "shinR",
  "footR",
] as const;
export type JointName = (typeof JOINTS)[number];

export const HIP_HEIGHT = 0.94;

const PARENT: Record<Exclude<JointName, "hips">, JointName> = {
  spine: "hips",
  chest: "spine",
  neck: "chest",
  head: "neck",
  shoulderL: "chest",
  upperArmL: "shoulderL",
  forearmL: "upperArmL",
  handL: "forearmL",
  shoulderR: "chest",
  upperArmR: "shoulderR",
  forearmR: "upperArmR",
  handR: "forearmR",
  thighL: "hips",
  shinL: "thighL",
  footL: "shinL",
  thighR: "hips",
  shinR: "thighR",
  footR: "shinR",
};

interface BodyDims {
  shoulder: number;
  chestR: number;
  waistR: number;
  hipR: number;
  limb: number;
  depth: number;
}

const BODY: Record<BodyType, BodyDims> = {
  slim: { shoulder: 0.168, chestR: 0.128, waistR: 0.108, hipR: 0.118, limb: 0.9, depth: 0.7 },
  average: { shoulder: 0.186, chestR: 0.145, waistR: 0.128, hipR: 0.132, limb: 1, depth: 0.72 },
  broad: { shoulder: 0.218, chestR: 0.168, waistR: 0.146, hipR: 0.142, limb: 1.15, depth: 0.74 },
  soft: { shoulder: 0.196, chestR: 0.158, waistR: 0.162, hipR: 0.166, limb: 1.1, depth: 0.84 },
};

const HEAD_R = 0.104;
const HEAD_STYLE_SCALE = 1.14;
const HEAD_SCALE = new THREE.Vector3(0.9, 1.06, 0.98);
const HEAD_CENTRE = new THREE.Vector3(0, 0.112, 0);
const UPPER_ARM = 0.28;
const FOREARM = 0.25;
const THIGH = 0.42;
const SHIN = 0.42;

type MaterialKey =
  | "skin"
  | "lips"
  | "hair"
  | "stubble"
  | "eyeWhite"
  | "iris"
  | "pupil"
  | "top"
  | "topTrim"
  | "bottom"
  | "shoe"
  | "sole"
  | "headwear"
  | "accessory"
  | "metal"
  | "frame"
  | "lens";

interface Part {
  joint: JointName;
  material: MaterialKey;
  geometry: THREE.BufferGeometry;
}

function shade(hex: string, amount: number): THREE.Color {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  return c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + amount)));
}

function makeMaterials(config: AvatarConfig): Record<MaterialKey, THREE.Material> {
  const std = (color: THREE.ColorRepresentation, roughness = 0.8, extra: THREE.MeshStandardMaterialParameters = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, ...extra });
  const lips = new THREE.Color(config.skinTone).lerp(new THREE.Color("#8a3b3b"), 0.32);
  return {
    skin: std(config.skinTone, 0.62),
    lips: std(lips, 0.55),
    hair: std(config.hairColor, 0.72, { side: THREE.DoubleSide }),
    stubble: std(config.hairColor, 0.9, { transparent: true, opacity: 0.38, depthWrite: false }),
    eyeWhite: std("#f5f2ea", 0.35),
    iris: std(config.eyeColor, 0.3),
    pupil: std("#0e0d0c", 0.25),
    top: std(config.topColor, 0.86),
    topTrim: std(shade(config.topColor, config.top === "jacket" ? 0.55 : -0.08), 0.85),
    bottom: std(config.bottomColor, 0.88),
    shoe: std(config.shoeColor, 0.55),
    sole: std(shade(config.shoeColor, -0.25), 0.7),
    headwear: std(config.headwearColor, 0.85, { side: THREE.DoubleSide }),
    accessory: std(config.accessoryColor, 0.75),
    metal: std("#d4b36a", 0.32, { metalness: 0.85 }),
    frame: std(config.glasses === "round" ? "#6b4b2a" : "#1b1b1d", 0.4, { metalness: 0.2 }),
    lens: std("#1a1d22", 0.15, { metalness: 0.3, transparent: true, opacity: config.glasses === "sun" ? 0.92 : 0.12, depthWrite: false }),
  };
}

/** Applies a transform to a fresh geometry and returns it. */
function place(
  g: THREE.BufferGeometry,
  pos: [number, number, number] = [0, 0, 0],
  rot: [number, number, number] = [0, 0, 0],
  scale: [number, number, number] = [1, 1, 1],
): THREE.BufferGeometry {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(...pos),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot, "XYZ")),
    new THREE.Vector3(...scale),
  );
  g.applyMatrix4(m);
  return g;
}

/** Part of the head sphere (in head-joint space, following the head's shape). */
function headShell(
  rScale: number,
  opts: { phiStart?: number; phiLength?: number; thetaStart?: number; thetaLength?: number; offset?: [number, number, number]; scale?: [number, number, number] } = {},
) {
  const g = new THREE.SphereGeometry(
    HEAD_R * rScale,
    36,
    20,
    opts.phiStart ?? 0,
    opts.phiLength ?? Math.PI * 2,
    opts.thetaStart ?? 0,
    opts.thetaLength ?? Math.PI,
  );
  const s = opts.scale ?? [1, 1, 1];
  const o = opts.offset ?? [0, 0, 0];
  return place(
    g,
    [HEAD_CENTRE.x + o[0], HEAD_CENTRE.y + o[1], HEAD_CENTRE.z + o[2]],
    [0, 0, 0],
    [HEAD_SCALE.x * s[0], HEAD_SCALE.y * s[1], HEAD_SCALE.z * s[2]],
  );
}

/** Sphere segment that leaves the face open (`gap` radians centred on +Z). */
function openFaceShell(rScale: number, gap: number, thetaStart: number, thetaEnd: number, scale?: [number, number, number], offset?: [number, number, number]) {
  // Three's sphere: phi = π/2 points to +Z.
  return headShell(rScale, {
    phiStart: Math.PI / 2 + gap / 2,
    phiLength: Math.PI * 2 - gap,
    thetaStart,
    thetaLength: thetaEnd - thetaStart,
    scale,
    offset,
  });
}

function capsule(radius: number, length: number, radial = 14) {
  return new THREE.CapsuleGeometry(radius, Math.max(0.001, length), 6, radial);
}

function lathe(profile: Array<[number, number]>, segments = 28) {
  return new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    segments,
  );
}

function buildParts(config: AvatarConfig): Part[] {
  const b = BODY[config.bodyType];
  const parts: Part[] = [];
  const add = (joint: JointName, material: MaterialKey, geometry: THREE.BufferGeometry) => parts.push({ joint, material, geometry });

  const armR = 0.04 * b.limb;
  const foreR = 0.034 * b.limb;
  const thighR = 0.066 * b.limb;
  const shinR = 0.05 * b.limb;
  const fullSleeves = config.top !== "tshirt" && config.top !== "dress";
  const dress = config.top === "dress";

  // ── Torso ────────────────────────────────────────────────────────────
  const abdomen = lathe([
    [0.001, -0.02],
    [b.hipR * 0.92, -0.02],
    [b.waistR, 0.07],
    [b.waistR * 1.03, 0.205],
  ]);
  add("spine", "top", place(abdomen, [0, 0, 0], [0, 0, 0], [1, 1, b.depth]));
  const chest = lathe([
    [b.waistR * 1.03, -0.005],
    [b.chestR, 0.07],
    [b.chestR * 1.05, 0.13],
    [Math.max(b.chestR * 1.05, b.shoulder * 0.84), 0.182],
    [b.shoulder * 0.66, 0.222],
    [0.056, 0.244],
    [0.001, 0.244],
  ]);
  add("chest", "top", place(chest, [0, 0, 0], [0, 0, 0], [1, 1, b.depth]));
  // Shoulders.
  for (const side of [1, -1] as const) {
    const joint = side === 1 ? "shoulderL" : "shoulderR";
    add(joint, "top", place(new THREE.SphereGeometry(armR * 1.3, 16, 12), [side * -0.008, -0.008, 0], [0, 0, 0], [1.1, 0.95, 0.95]));
  }
  // Pelvis.
  const pelvis = lathe([
    [0.001, -0.13],
    [b.hipR * 0.72, -0.12],
    [b.hipR, -0.05],
    [b.hipR * 0.95, 0.06],
    [0.001, 0.06],
  ]);
  add("hips", dress ? "top" : "bottom", place(pelvis, [0, 0, 0], [0, 0, 0], [1, 1, b.depth * 1.05]));

  // Neck.
  add("neck", "skin", place(new THREE.CylinderGeometry(0.044, 0.05, 0.1, 14), [0, 0.035, 0]));

  // ── Head and face ────────────────────────────────────────────────────
  add("head", "skin", headShell(1));
  for (const side of [1, -1] as const) {
    add("head", "skin", place(new THREE.SphereGeometry(0.022, 10, 8), [side * 0.091, 0.105, -0.005], [0, 0, 0], [0.45, 1, 0.75]));
    // Eyes.
    add("head", "eyeWhite", place(new THREE.SphereGeometry(0.0165, 14, 10), [side * 0.034, 0.122, 0.082], [0, 0, 0], [1, 1, 0.55]));
    add("head", "iris", place(new THREE.SphereGeometry(0.0095, 12, 8), [side * 0.034, 0.122, 0.0895], [0, 0, 0], [1, 1, 0.4]));
    add("head", "pupil", place(new THREE.SphereGeometry(0.0045, 8, 6), [side * 0.034, 0.122, 0.0933], [0, 0, 0], [1, 1, 0.4]));
    // Brows.
    add("head", "hair", place(new THREE.BoxGeometry(0.03, 0.0055, 0.008), [side * 0.035, 0.148, 0.09], [0, 0, side * 0.08]));
  }
  add("head", "skin", place(new THREE.SphereGeometry(0.014, 12, 8), [0, 0.1, 0.096], [0, 0, 0], [0.85, 1, 1.15]));
  add("head", "lips", place(capsule(0.0055, 0.022, 8), [0, 0.067, 0.091], [0, 0, Math.PI / 2], [1, 1, 0.7]));

  // ── Hair ─────────────────────────────────────────────────────────────
  const hatCovers = config.headwear === "headscarf";
  if (!hatCovers) addHair(config, add);

  // ── Facial hair ──────────────────────────────────────────────────────
  const mustache = () => {
    for (const side of [1, -1] as const) {
      add("head", "hair", place(capsule(0.0068, 0.018, 8), [side * 0.012, 0.079, 0.0935], [0, 0, side * 1.25]));
    }
  };
  switch (config.facialHair) {
    case "stubble":
      add("head", "stubble", openFaceShell(1.012, Math.PI * 1.15, Math.PI * 0.56, Math.PI * 0.84));
      add(
        "head",
        "stubble",
        headShell(1.012, { phiStart: Math.PI / 2 - Math.PI * 0.42, phiLength: Math.PI * 0.84, thetaStart: Math.PI * 0.58, thetaLength: Math.PI * 0.28 }),
      );
      break;
    case "mustache":
      mustache();
      break;
    case "goatee":
      mustache();
      add("head", "hair", place(new THREE.SphereGeometry(0.02, 12, 10), [0, 0.04, 0.083], [0.3, 0, 0], [1, 1.25, 0.6]));
      break;
    case "beard":
      mustache();
      add(
        "head",
        "hair",
        headShell(1.045, { phiStart: Math.PI / 2 - Math.PI * 0.5, phiLength: Math.PI, thetaStart: Math.PI * 0.6, thetaLength: Math.PI * 0.3, scale: [1, 1, 1.03] }),
      );
      add("head", "hair", place(new THREE.SphereGeometry(0.045, 14, 10), [0, 0.035, 0.05], [0, 0, 0], [1.2, 0.9, 1]));
      break;
  }

  // ── Headwear ─────────────────────────────────────────────────────────
  switch (config.headwear) {
    case "cap":
      add("head", "headwear", headShell(1.13, { thetaLength: Math.PI * 0.46, offset: [0, 0.008, -0.004], scale: [1, 0.92, 1] }));
      add("head", "headwear", place(new THREE.CylinderGeometry(0.07, 0.07, 0.007, 20, 1, false, Math.PI * 0.05, Math.PI * 0.9), [0, 0.146, 0.072], [0.12, 0, 0], [1, 1, 1.35]));
      add("head", "headwear", place(new THREE.SphereGeometry(0.008, 8, 6), [0, 0.235, 0]));
      break;
    case "beanie":
      add("head", "headwear", headShell(1.14, { thetaLength: Math.PI * 0.55, offset: [0, 0.012, -0.004], scale: [1, 1.06, 1] }));
      add("head", "headwear", place(new THREE.TorusGeometry(HEAD_R * 1.04, 0.014, 8, 36), [0, 0.13, -0.004], [Math.PI / 2, 0, 0], [HEAD_SCALE.x * 1.04, HEAD_SCALE.z * 1.06, 1]));
      break;
    case "beret":
      add("head", "headwear", place(new THREE.SphereGeometry(0.13, 24, 12), [0.015, 0.215, -0.01], [0, 0, 0.22], [1.08, 0.3, 1.04]));
      add("head", "headwear", place(new THREE.CylinderGeometry(0.006, 0.006, 0.02, 6), [0.03, 0.258, -0.01], [0, 0, 0.22]));
      break;
    case "headscarf":
      add("head", "headwear", openFaceShell(1.13, Math.PI * 0.62, 0, Math.PI * 0.86, [1, 1.02, 1.04], [0, 0.002, -0.006]));
      add("head", "headwear", place(new THREE.CylinderGeometry(0.085, 0.11, 0.1, 22, 1, true), [0, -0.005, -0.004], [0.1, 0, 0], [1.05, 1, 0.95]));
      add("chest", "headwear", place(new THREE.CylinderGeometry(0.1, b.shoulder * 0.98, 0.13, 26, 1, true), [0, 0.19, -0.002], [0, 0, 0], [1, 1, b.depth * 1.18]));
      break;
  }

  // ── Glasses ──────────────────────────────────────────────────────────
  if (config.glasses !== "none") {
    const round = config.glasses === "round";
    const z = 0.104;
    for (const side of [1, -1] as const) {
      const ring = round
        ? place(new THREE.TorusGeometry(0.021, 0.003, 8, 24), [side * 0.035, 0.122, z])
        : place(new THREE.TorusGeometry(0.026, 0.0035, 6, 4), [side * 0.036, 0.121, z], [0, 0, Math.PI / 4], [1.15, 0.78, 1]);
      add("head", "frame", ring);
      if (config.glasses === "sun" || round) {
        add("head", "lens", place(new THREE.CircleGeometry(round ? 0.02 : 0.025, round ? 20 : 4), [side * 0.035, 0.121, z - 0.001], [0, 0, round ? 0 : Math.PI / 4], round ? [1, 1, 1] : [1.15, 0.78, 1]));
      } else {
        add("head", "lens", place(new THREE.CircleGeometry(0.025, 4), [side * 0.036, 0.121, z - 0.001], [0, 0, Math.PI / 4], [1.15, 0.78, 1]));
      }
      add("head", "frame", place(new THREE.BoxGeometry(0.004, 0.004, 0.1), [side * 0.088, 0.126, 0.055], [0, side * 0.06, 0]));
    }
    add("head", "frame", place(new THREE.BoxGeometry(0.022, 0.003, 0.003), [0, 0.126, z]));
  }

  // ── Arms ─────────────────────────────────────────────────────────────
  for (const side of [1, -1] as const) {
    const s = side === 1 ? "L" : "R";
    const upper = `upperArm${s}` as JointName;
    const fore = `forearm${s}` as JointName;
    const hand = `hand${s}` as JointName;
    if (fullSleeves) {
      add(upper, "top", place(capsule(armR * 1.08, UPPER_ARM - 0.06), [0, -UPPER_ARM / 2, 0]));
      add(fore, "top", place(capsule(foreR * 1.12, FOREARM - 0.07), [0, -FOREARM / 2 + 0.01, 0]));
      add(fore, "topTrim", place(new THREE.CylinderGeometry(foreR * 1.18, foreR * 1.18, 0.025, 12), [0, -FOREARM + 0.035, 0]));
    } else {
      add(upper, "skin", place(capsule(armR, UPPER_ARM - 0.05), [0, -UPPER_ARM / 2, 0]));
      add(upper, "top", place(new THREE.CylinderGeometry(armR * 1.28, armR * 1.2, 0.11, 14), [0, -0.05, 0]));
      add(fore, "skin", place(capsule(foreR, FOREARM - 0.05), [0, -FOREARM / 2, 0]));
    }
    add(hand, "skin", place(new THREE.SphereGeometry(0.04, 14, 10), [0, -0.045, 0.004], [0, 0, 0], [0.62, 1.15, 0.92]));
    add(hand, "skin", place(capsule(0.011, 0.03, 6), [side * -0.026, -0.03, 0.02], [0.4, 0, side * 0.5]));
  }

  // ── Legs ─────────────────────────────────────────────────────────────
  const legsCovered = !dress && config.bottom === "trousers";
  const shorts = !dress && config.bottom === "shorts";
  for (const side of [1, -1] as const) {
    const s = side === 1 ? "L" : "R";
    const thigh = `thigh${s}` as JointName;
    const shin = `shin${s}` as JointName;
    const foot = `foot${s}` as JointName;
    add(thigh, legsCovered || shorts ? "bottom" : "skin", place(capsule(thighR, THIGH - 0.08), [0, -THIGH / 2, 0]));
    if (shorts) add(thigh, "bottom", place(new THREE.CylinderGeometry(thighR * 1.1, thighR * 1.12, 0.22, 14), [0, -0.12, 0]));
    if (shorts) {
      // Skin below the hem.
      add(thigh, "skin", place(capsule(thighR * 0.92, 0.12), [0, -THIGH + 0.09, 0]));
    }
    add(shin, legsCovered ? "bottom" : "skin", place(capsule(shinR * (legsCovered ? 1.15 : 1), SHIN - 0.08), [0, -SHIN / 2, 0]));
    if (legsCovered) add(shin, "bottom", place(new THREE.CylinderGeometry(shinR * 1.25, shinR * 1.3, 0.05, 14), [0, -SHIN + 0.08, 0]));
    // Shoe and sole.
    add(foot, "shoe", place(capsule(0.045, 0.12, 12), [0, -0.022, 0.045], [Math.PI / 2, 0, 0], [1, 1, 0.75]));
    add(foot, "shoe", place(new THREE.CylinderGeometry(0.047, 0.05, 0.06, 14), [0, 0.005, -0.005]));
    add(foot, "sole", place(new THREE.BoxGeometry(0.086, 0.016, 0.2), [0, -0.054, 0.045]));
  }

  // ── Skirts and dresses ───────────────────────────────────────────────
  if (dress) {
    add("hips", "top", place(new THREE.CylinderGeometry(b.hipR * 1.02, b.hipR * 1.75, 0.5, 30, 1, true), [0, -0.27, 0], [0, 0, 0], [1, 1, b.depth * 1.15]));
    add("hips", "topTrim", place(new THREE.TorusGeometry(b.hipR * 1.0, 0.012, 6, 30), [0, 0.04, 0], [Math.PI / 2, 0, 0], [1, b.depth * 1.05, 1]));
  } else if (config.bottom === "skirt") {
    add("hips", "bottom", place(new THREE.CylinderGeometry(b.hipR * 1.02, b.hipR * 1.55, 0.4, 30, 1, true), [0, -0.2, 0], [0, 0, 0], [1, 1, b.depth * 1.12]));
  }

  // ── Garment details ──────────────────────────────────────────────────
  switch (config.top) {
    case "tshirt":
    case "longsleeve":
      add("chest", "topTrim", place(new THREE.TorusGeometry(0.052, 0.008, 6, 22), [0, 0.232, 0.004], [Math.PI / 2 + 0.25, 0, 0]));
      break;
    case "sweater":
      add("chest", "topTrim", place(new THREE.TorusGeometry(0.05, 0.016, 8, 24), [0, 0.235, 0], [Math.PI / 2 + 0.15, 0, 0]));
      add("spine", "topTrim", place(new THREE.TorusGeometry(b.hipR * 0.95, 0.014, 6, 30), [0, -0.01, 0], [Math.PI / 2, 0, 0], [1, b.depth, 1]));
      break;
    case "hoodie":
      add("chest", "top", place(new THREE.TorusGeometry(0.075, 0.032, 10, 24, Math.PI * 1.25), [0, 0.24, -0.03], [Math.PI / 2 + 0.35, 0, -Math.PI * 0.125 + Math.PI], [1, 1.1, 1]));
      add("spine", "topTrim", place(new THREE.BoxGeometry(b.waistR * 1.25, 0.09, 0.012), [0, 0.06, b.waistR * b.depth * 1.02]));
      for (const side of [1, -1]) add("chest", "topTrim", place(capsule(0.003, 0.09, 4), [side * 0.02, 0.165, b.chestR * b.depth * 0.98]));
      break;
    case "jacket": {
      const front = b.chestR * b.depth;
      add("chest", "topTrim", place(new THREE.BoxGeometry(0.06, 0.2, 0.01), [0, 0.11, front * 0.97]));
      add("spine", "topTrim", place(new THREE.BoxGeometry(0.05, 0.2, 0.01), [0, 0.1, b.waistR * b.depth * 0.98]));
      for (const side of [1, -1]) {
        add("chest", "top", place(new THREE.BoxGeometry(0.035, 0.12, 0.012), [side * 0.044, 0.16, front * 0.99], [0.15, 0, side * 0.32]));
      }
      add("spine", "topTrim", place(new THREE.SphereGeometry(0.007, 8, 6), [0.03, 0.12, b.waistR * b.depth * 1.03]));
      break;
    }
    case "dress":
      break;
  }

  // ── Accessories ──────────────────────────────────────────────────────
  switch (config.accessory) {
    case "scarf":
      add("chest", "accessory", place(new THREE.TorusGeometry(0.067, 0.03, 10, 26), [0, 0.235, 0.004], [Math.PI / 2 + 0.2, 0, 0], [1, 1.15, 1]));
      add("chest", "accessory", place(new THREE.BoxGeometry(0.06, 0.2, 0.022), [0.04, 0.12, b.chestR * b.depth + 0.008], [0.08, 0, 0.06]));
      break;
    case "necklace":
      add("chest", "metal", place(new THREE.TorusGeometry(0.068, 0.0028, 6, 32), [0, 0.215, 0.012], [Math.PI / 2 + 0.6, 0, 0], [1, 1.25, 1]));
      add("chest", "accessory", place(new THREE.SphereGeometry(0.011, 10, 8), [0, 0.16, b.chestR * b.depth * 0.8 + 0.012]));
      break;
    case "bag":
      add("chest", "accessory", place(new THREE.TorusGeometry(0.21, 0.007, 6, 40), [0, 0.03, 0], [Math.PI / 2, 0.75, 0], [b.shoulder / 0.19, b.depth * 0.9, 1]));
      add("hips", "accessory", place(new THREE.BoxGeometry(0.05, 0.13, 0.16), [-(b.hipR + 0.035), -0.02, 0.02]));
      add("hips", "metal", place(new THREE.BoxGeometry(0.052, 0.012, 0.03), [-(b.hipR + 0.036), 0.0, 0.06]));
      break;
  }

  return parts;
}

type AddPart = (joint: JointName, material: MaterialKey, geometry: THREE.BufferGeometry) => void;

function addHair(config: AvatarConfig, add: AddPart) {
  const style = config.hairStyle;
  if (style === "none") return;
  const hat = config.headwear !== "none";
  // A hat sits over the crown; trim hair that would poke through it.
  const crown = (r: number, theta: number, scale?: [number, number, number]) => {
    if (!hat) add("head", "hair", headShell(r, { thetaLength: theta, scale }));
  };
  switch (style) {
    case "buzz":
      add("head", "hair", headShell(1.012, { thetaLength: Math.PI * 0.42 }));
      add("head", "hair", openFaceShell(1.012, Math.PI * 0.75, Math.PI * 0.3, Math.PI * 0.6));
      break;
    case "short":
      crown(1.06, Math.PI * 0.4, [1, 1.02, 1.02]);
      add("head", "hair", openFaceShell(1.055, Math.PI * 0.82, Math.PI * 0.32, Math.PI * 0.62));
      if (!hat) add("head", "hair", place(new THREE.SphereGeometry(0.06, 16, 10), [0.012, 0.19, 0.055], [0.5, 0, 0.2], [1.25, 0.42, 0.75]));
      break;
    case "side":
      crown(1.07, Math.PI * 0.42, [1, 1.04, 1.02]);
      add("head", "hair", openFaceShell(1.06, Math.PI * 0.8, Math.PI * 0.32, Math.PI * 0.64));
      if (!hat) add("head", "hair", place(new THREE.SphereGeometry(0.075, 18, 12), [-0.02, 0.205, 0.035], [0.3, 0, -0.35], [1.2, 0.5, 1]));
      break;
    case "bob":
      crown(1.09, Math.PI * 0.42, [1.02, 1.03, 1.03]);
      add("head", "hair", openFaceShell(1.1, Math.PI * 0.62, Math.PI * 0.3, Math.PI * 0.76, [1.04, 1, 1.03]));
      if (!hat) add("head", "hair", place(new THREE.SphereGeometry(0.07, 18, 10), [0, 0.19, 0.06], [0.6, 0, 0], [1.35, 0.4, 0.7]));
      break;
    case "long":
      crown(1.08, Math.PI * 0.42, [1.02, 1.03, 1.03]);
      add("head", "hair", openFaceShell(1.09, Math.PI * 0.6, Math.PI * 0.3, Math.PI * 0.74, [1.03, 1, 1.03]));
      add("head", "hair", place(capsule(0.085, 0.2, 14), [0, -0.03, -0.065], [0.12, 0, 0], [1.25, 1, 0.5]));
      for (const side of [1, -1]) add("head", "hair", place(capsule(0.03, 0.15, 8), [side * 0.08, 0.0, 0.0], [0.1, 0, side * -0.08], [1, 1, 0.8]));
      if (!hat) add("head", "hair", place(new THREE.SphereGeometry(0.07, 18, 10), [0.01, 0.195, 0.055], [0.6, 0, 0.1], [1.35, 0.4, 0.7]));
      break;
    case "curly": {
      add("head", "hair", openFaceShell(1.05, Math.PI * 0.75, 0, Math.PI * 0.6));
      const n = 34;
      for (let i = 0; i < n; i++) {
        // Fibonacci points on the upper/back head, skipping the face.
        const y = 1 - (i / (n - 1)) * 1.15;
        const r = Math.sqrt(Math.max(0, 1 - y * y));
        const phi = i * 2.399963;
        const x = Math.cos(phi) * r;
        const z = Math.sin(phi) * r;
        if (z > 0.35 && y < 0.55) continue;
        if (hat && y > 0.35) continue;
        const p = new THREE.Vector3(x, y, z).multiply(HEAD_SCALE).multiplyScalar(HEAD_R * 1.04).add(HEAD_CENTRE);
        add("head", "hair", place(new THREE.SphereGeometry(0.032, 10, 8), [p.x, p.y, p.z]));
      }
      break;
    }
    case "afro":
      if (hat) add("head", "hair", openFaceShell(1.3, Math.PI * 0.6, Math.PI * 0.35, Math.PI * 0.72, [1, 0.9, 1], [0, 0, -0.02]));
      else add("head", "hair", openFaceShell(1.45, Math.PI * 0.5, 0, Math.PI * 0.7, [1.02, 0.92, 1], [0, 0.03, -0.025]));
      break;
    case "bun":
      crown(1.045, Math.PI * 0.45);
      add("head", "hair", openFaceShell(1.045, Math.PI * 0.8, Math.PI * 0.3, Math.PI * 0.6));
      add("head", "hair", place(new THREE.SphereGeometry(0.048, 16, 12), [0, hat ? 0.13 : 0.215, -0.085]));
      break;
    case "ponytail":
      crown(1.045, Math.PI * 0.45);
      add("head", "hair", openFaceShell(1.045, Math.PI * 0.8, Math.PI * 0.3, Math.PI * 0.62));
      add("head", "hair", place(capsule(0.03, 0.17, 10), [0, 0.04, -0.13], [-0.3, 0, 0]));
      add("head", "accessory", place(new THREE.TorusGeometry(0.022, 0.007, 6, 14), [0, 0.135, -0.11], [Math.PI / 2 - 0.3, 0, 0]));
      break;
  }
}

export interface AvatarBuild {
  root: THREE.Group;
  joints: Record<JointName, THREE.Object3D>;
  materials: THREE.Material[];
  dispose: () => void;
}

/** Rest-pose joint offsets relative to the parent joint. */
function jointOffsets(config: AvatarConfig): Record<JointName, [number, number, number]> {
  const b = BODY[config.bodyType];
  return {
    hips: [0, HIP_HEIGHT, 0],
    spine: [0, 0.05, 0],
    chest: [0, 0.205, 0],
    neck: [0, 0.225, 0],
    head: [0, 0.058, 0.006],
    shoulderL: [b.shoulder, 0.185, -0.004],
    upperArmL: [0.012, 0, 0],
    forearmL: [0, -UPPER_ARM, 0],
    handL: [0, -FOREARM, 0],
    shoulderR: [-b.shoulder, 0.185, -0.004],
    upperArmR: [-0.012, 0, 0],
    forearmR: [0, -UPPER_ARM, 0],
    handR: [0, -FOREARM, 0],
    thighL: [b.hipR * 0.62, -0.045, 0],
    shinL: [0, -THIGH, 0],
    footL: [0, -SHIN, 0],
    thighR: [-b.hipR * 0.62, -0.045, 0],
    shinR: [0, -THIGH, 0],
    footR: [0, -SHIN, 0],
  };
}

export function buildAvatar(config: AvatarConfig): AvatarBuild {
  const root = new THREE.Group();
  root.name = "avatar";
  const scaleNode = new THREE.Group();
  scaleNode.name = "avatar-scale";
  scaleNode.scale.setScalar(config.height);
  root.add(scaleNode);

  const offsets = jointOffsets(config);
  const joints = {} as Record<JointName, THREE.Object3D>;
  for (const name of JOINTS) {
    const j = new THREE.Object3D();
    j.name = name;
    j.position.set(...offsets[name]);
    joints[name] = j;
  }
  for (const name of JOINTS) {
    if (name === "hips") scaleNode.add(joints.hips);
    else joints[PARENT[name]].add(joints[name]);
  }
  // Slightly stylised proportions: a larger head reads better at a distance.
  joints.head.scale.setScalar(HEAD_STYLE_SCALE);

  const materials = makeMaterials(config);
  const groups = new Map<string, { joint: JointName; material: MaterialKey; geometries: THREE.BufferGeometry[] }>();
  for (const part of buildParts(config)) {
    const key = `${part.joint}:${part.material}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { joint: part.joint, material: part.material, geometries: [] }));
    // Keep attribute sets identical so the geometries merge.
    for (const attr of Object.keys(part.geometry.attributes)) {
      if (attr !== "position" && attr !== "normal" && attr !== "uv") part.geometry.deleteAttribute(attr);
    }
    g.geometries.push(part.geometry);
  }

  const geometries: THREE.BufferGeometry[] = [];
  for (const g of groups.values()) {
    const list = g.geometries.every((x) => x.index) ? g.geometries : g.geometries.map((x) => (x.index ? x.toNonIndexed() : x));
    const merged = mergeGeometries(list, false) ?? list[0]!;
    for (const x of new Set([...g.geometries, ...list])) if (x !== merged) x.dispose();
    geometries.push(merged);
    const mesh = new THREE.Mesh(merged, materials[g.material]);
    mesh.name = `${g.joint}-${g.material}`;
    // Transparent overlays (stubble, lenses) draw after the opaque head.
    if (g.material === "stubble" || g.material === "lens") mesh.renderOrder = 2;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    joints[g.joint].add(mesh);
  }

  return {
    root,
    joints,
    materials: Object.values(materials),
    dispose: () => {
      for (const g of geometries) g.dispose();
      for (const m of Object.values(materials)) m.dispose();
    },
  };
}
