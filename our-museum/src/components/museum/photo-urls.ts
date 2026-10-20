"use client";

import type { ScenePhoto } from "@/features/museums/scene-types";
import { paintSampleArt } from "@/three/loaders/sample-art";

const sampleCache = new Map<string, string>();

/** URL to display a photo in HTML. Sample art is painted once and cached as a data URL. */
export function photoImageUrl(photo: ScenePhoto, size: "thumb" | "medium" | "large"): string | null {
  if (photo.urls) return photo.urls[size];
  if (!photo.sample || typeof document === "undefined") return null;
  const key = `${photo.id}:${size}`;
  const hit = sampleCache.get(key);
  if (hit) return hit;
  const max = size === "thumb" ? 360 : size === "medium" ? 900 : 1600;
  const aspect = photo.width / photo.height;
  const [w, h] = aspect >= 1 ? [max, Math.round(max / aspect)] : [Math.round(max * aspect), max];
  const url = paintSampleArt(photo.sample, w, h).toDataURL("image/jpeg", 0.88);
  sampleCache.set(key, url);
  return url;
}
