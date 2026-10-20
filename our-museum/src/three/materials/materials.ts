"use client";

/**
 * Shared material instances. Creating a material per mesh multiplies shader
 * programs and GPU memory, so materials are cached by their parameters.
 */
import * as THREE from "three";
import type { FloorMaterial } from "@/features/rooms/geometry";
import { floorSpec, plasterTexture } from "./textures";

const cache = new Map<string, THREE.Material>();

function get<T extends THREE.Material>(key: string, make: () => T): T {
  let m = cache.get(key);
  if (!m) {
    m = make();
    cache.set(key, m);
  }
  return m as T;
}

export function wallMaterial(color: string, plaster: boolean) {
  return get(`wall:${color}:${plaster}`, () => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0 });
    if (plaster) m.map = plasterTexture();
    return m;
  });
}

export function floorMaterial(kind: FloorMaterial, textureSize: number) {
  return get(`floor:${kind}:${textureSize}`, () => {
    const spec = floorSpec(kind, textureSize);
    return new THREE.MeshStandardMaterial({
      map: spec.texture,
      roughness: spec.roughness,
      metalness: spec.metalness,
      envMapIntensity: spec.envMapIntensity,
    });
  });
}

export function plainMaterial(color: string, roughness = 0.7, metalness = 0) {
  return get(`plain:${color}:${roughness}:${metalness}`, () => new THREE.MeshStandardMaterial({ color, roughness, metalness }));
}

export function emissiveMaterial(color: string, intensity = 1) {
  return get(`emissive:${color}:${intensity}`, () => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), toneMapped: false }));
}

export function ceilingMaterial(color: string) {
  return get(`ceiling:${color}`, () => new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0, side: THREE.FrontSide }));
}

/** Invisible but raycastable material for wall picking surfaces. */
export const pickerMaterial = new THREE.MeshBasicMaterial({ visible: false, side: THREE.FrontSide });

export function floorTextureSize(quality: "low" | "medium" | "high") {
  return quality === "high" ? 1024 : quality === "medium" ? 1024 : 512;
}
