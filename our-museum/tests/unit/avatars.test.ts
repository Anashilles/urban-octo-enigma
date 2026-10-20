import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  ACCESSORIES,
  BODY_TYPES,
  BOTTOMS,
  FACIAL_HAIR,
  GLASSES,
  HAIR_STYLES,
  HEADWEAR,
  TOPS,
  avatarConfigSchema,
  defaultAvatar,
  normalizeAvatarConfig,
  randomAvatar,
  sameAvatar,
  seededRandom,
  type AvatarConfig,
} from "@/features/avatars/config";
import { avatarClips } from "@/three/avatars/avatar-animations";
import { JOINTS, buildAvatar } from "@/three/avatars/avatar-builder";

describe("avatar config", () => {
  it("gives every user a stable, valid default", () => {
    const a = defaultAvatar("user-1");
    expect(avatarConfigSchema.parse(a)).toEqual(a);
    expect(sameAvatar(a, defaultAvatar("user-1"))).toBe(true);
    expect(sameAvatar(a, defaultAvatar("user-2"))).toBe(false);
    // Defaults start plain; the editor's "Surprise me" explores the rest.
    expect(a).toMatchObject({ facialHair: "none", headwear: "none", glasses: "none", accessory: "none" });
  });

  it("only produces valid random avatars", () => {
    const rand = seededRandom("random-test");
    for (let i = 0; i < 300; i++) {
      const a = randomAvatar(rand);
      expect(avatarConfigSchema.safeParse(a).success).toBe(true);
    }
  });

  it("rejects unknown fields, invalid colours, enums and heights", () => {
    const base = defaultAvatar("x");
    expect(avatarConfigSchema.safeParse({ ...base, extra: true }).success).toBe(false);
    expect(avatarConfigSchema.safeParse({ ...base, skinTone: "red" }).success).toBe(false);
    expect(avatarConfigSchema.safeParse({ ...base, skinTone: "#12345" }).success).toBe(false);
    expect(avatarConfigSchema.safeParse({ ...base, hairColor: "url(javascript:alert(1))" }).success).toBe(false);
    expect(avatarConfigSchema.safeParse({ ...base, hairStyle: "mohawk" }).success).toBe(false);
    expect(avatarConfigSchema.safeParse({ ...base, height: 1.5 }).success).toBe(false);
    expect(avatarConfigSchema.safeParse({ ...base, height: Number.NaN }).success).toBe(false);
  });

  it("normalises colours and rounds the height", () => {
    const parsed = avatarConfigSchema.parse({ ...defaultAvatar("x"), topColor: "#ABCDEF", height: 1.0349 });
    expect(parsed.topColor).toBe("#abcdef");
    expect(parsed.height).toBe(1.03);
  });

  it("reads stored configs leniently, keeping valid fields", () => {
    const seed = "u";
    const fallback = defaultAvatar(seed);
    const n = normalizeAvatarConfig({ hairStyle: "afro", skinTone: "not-a-colour", removedField: 1 }, seed);
    expect(n.hairStyle).toBe("afro");
    expect(n.skinTone).toBe(fallback.skinTone);
    expect("removedField" in n).toBe(false);
    expect(normalizeAvatarConfig(null, seed)).toEqual(fallback);
    expect(normalizeAvatarConfig([1, 2], seed)).toEqual(fallback);
  });
});

function variants(): AvatarConfig[] {
  const base = defaultAvatar("variants");
  const list: AvatarConfig[] = [];
  for (const bodyType of BODY_TYPES) list.push({ ...base, bodyType });
  for (const hairStyle of HAIR_STYLES) for (const headwear of HEADWEAR) list.push({ ...base, hairStyle, headwear });
  for (const facialHair of FACIAL_HAIR) list.push({ ...base, facialHair });
  for (const glasses of GLASSES) list.push({ ...base, glasses });
  for (const top of TOPS) for (const bottom of BOTTOMS) list.push({ ...base, top, bottom });
  for (const accessory of ACCESSORIES) list.push({ ...base, accessory });
  return list;
}

describe("avatar figure", () => {
  it("builds every option combination with a complete rig and bounded draw calls", () => {
    for (const config of variants()) {
      const avatar = buildAvatar(config);
      for (const name of JOINTS) expect(avatar.root.getObjectByName(name), name).toBeTruthy();
      let meshes = 0;
      const box = new THREE.Box3();
      avatar.root.updateMatrixWorld(true);
      avatar.root.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        meshes++;
        const pos = o.geometry.getAttribute("position");
        expect(Array.prototype.every.call(pos.array, Number.isFinite), o.name).toBe(true);
        box.expandByObject(o);
      });
      expect(meshes).toBeLessThanOrEqual(40);
      const size = box.getSize(new THREE.Vector3());
      // A person-sized figure standing on the floor.
      expect(box.min.y).toBeGreaterThan(-0.12);
      expect(box.min.y).toBeLessThan(0.02);
      expect(size.y).toBeGreaterThan(1.5);
      expect(size.y).toBeLessThan(2.0);
      avatar.dispose();
    }
  }, 30_000);

  it("builds fast enough to swap appearances without a hitch", () => {
    const configs = variants().slice(0, 20);
    const start = performance.now();
    for (const c of configs) buildAvatar(c).dispose();
    expect((performance.now() - start) / configs.length).toBeLessThan(40);
  });

  it("scales with the height setting", () => {
    const short = buildAvatar({ ...defaultAvatar("h"), height: 0.92 });
    const tall = buildAvatar({ ...defaultAvatar("h"), height: 1.08 });
    const h = (b: ReturnType<typeof buildAvatar>) => new THREE.Box3().setFromObject(b.root).getSize(new THREE.Vector3()).y;
    expect(h(tall) / h(short)).toBeCloseTo(1.08 / 0.92, 1);
  });

  it("ships clips that only animate joints of the rig, with finite keys", () => {
    const names = new Set<string>(JOINTS);
    for (const clip of Object.values(avatarClips())) {
      expect(clip.duration).toBeGreaterThan(0);
      for (const track of clip.tracks) {
        const [node, prop] = track.name.split(".");
        expect(names.has(node!), track.name).toBe(true);
        expect(["quaternion", "position"]).toContain(prop);
        expect(Array.prototype.every.call(track.values, Number.isFinite), track.name).toBe(true);
      }
    }
  });

  it("loops seamlessly: the last walk key equals the first", () => {
    const walk = avatarClips().walk;
    for (const track of walk.tracks) {
      const size = track.getValueSize();
      const first = Array.from(track.values.slice(0, size));
      const last = Array.from(track.values.slice(-size));
      last.forEach((v, i) => expect(Math.abs(v - first[i]!)).toBeLessThan(1e-6));
    }
  });
});
