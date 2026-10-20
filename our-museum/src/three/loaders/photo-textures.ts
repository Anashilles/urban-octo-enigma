"use client";

/**
 * Loads and caches photo textures at two levels of detail with bounded GPU
 * memory. Distant frames use ~400px thumbnails, nearby frames ~1024px; the
 * full-size image is only ever loaded by the HTML photo viewer.
 */
import * as THREE from "three";
import type { ScenePhoto } from "@/features/museums/scene-types";
import { paintSampleArt } from "./sample-art";

export type Level = "thumb" | "medium";

interface Entry {
  key: string;
  texture: THREE.Texture | null;
  state: "queued" | "loading" | "ready" | "error";
  lastUsed: number;
  priority: number;
  photo: ScenePhoto;
  level: Level;
  url: string | null;
}

const BUDGET: Record<Level, number> = { thumb: 140, medium: 28 };
const MAX_CONCURRENT = 4;

export class PhotoTextureManager {
  private entries = new Map<string, Entry>();
  private active = 0;
  private maxAnisotropy = 4;
  private loader = new THREE.TextureLoader();
  private disposed = false;
  onError?: (photo: ScenePhoto, level: Level) => void;

  constructor() {
    this.loader.setCrossOrigin("anonymous");
  }

  setMaxAnisotropy(n: number) {
    this.maxAnisotropy = Math.min(8, n);
  }

  private keyOf(photo: ScenePhoto, level: Level) {
    return `${photo.id}:${level}`;
  }

  /**
   * Returns the texture when ready, otherwise queues it (higher priority =
   * sooner) and returns null. Call every update for the textures in use.
   */
  request(photo: ScenePhoto, requested: Level, priority: number): THREE.Texture | null {
    // Procedural sample art is painted once at a single, moderate size.
    const level: Level = photo.sample ? "thumb" : requested;
    const key = this.keyOf(photo, level);
    const url = photo.urls ? (level === "thumb" ? photo.urls.thumb : photo.urls.medium) : null;
    let e = this.entries.get(key);
    if (e && e.url !== url && photo.urls && e.state !== "ready") {
      // Signed URL refreshed after an error: retry with the new one.
      e.url = url;
      if (e.state === "error") e.state = "queued";
    }
    if (!e) {
      e = { key, texture: null, state: "queued", lastUsed: performance.now(), priority, photo, level, url };
      this.entries.set(key, e);
    }
    e.photo = photo;
    e.lastUsed = performance.now();
    e.priority = priority;
    return e.state === "ready" ? e.texture : null;
  }

  /** Starts queued loads and evicts least-recently-used textures over budget. */
  pump() {
    if (this.disposed) return;
    const queued = [...this.entries.values()].filter((e) => e.state === "queued").sort((a, b) => b.priority - a.priority);
    while (this.active < MAX_CONCURRENT && queued.length) this.load(queued.shift()!);
    for (const level of ["thumb", "medium"] as const) {
      const ready = [...this.entries.values()].filter((e) => e.level === level && e.state === "ready");
      if (ready.length <= BUDGET[level]) continue;
      ready.sort((a, b) => a.lastUsed - b.lastUsed);
      const now = performance.now();
      for (const e of ready.slice(0, ready.length - BUDGET[level])) {
        if (now - e.lastUsed < 1500) continue; // still on screen
        e.texture?.dispose();
        this.entries.delete(e.key);
      }
    }
  }

  private finish(e: Entry, texture: THREE.Texture | null) {
    this.active--;
    if (this.disposed) {
      texture?.dispose();
      return;
    }
    if (!texture) {
      e.state = "error";
      this.onError?.(e.photo, e.level);
      return;
    }
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = this.maxAnisotropy;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.needsUpdate = true;
    e.texture = texture;
    e.state = "ready";
  }

  private load(e: Entry) {
    e.state = "loading";
    this.active++;
    if (e.photo.sample) {
      // Paint off the critical path so frames are not dropped.
      const size = 640;
      const aspect = e.photo.width / e.photo.height;
      const [w, h] = aspect >= 1 ? [size, Math.round(size / aspect)] : [Math.round(size * aspect), size];
      const run = () => {
        try {
          this.finish(e, new THREE.CanvasTexture(paintSampleArt(e.photo.sample!, w, h)));
        } catch {
          this.finish(e, null);
        }
      };
      if ("requestIdleCallback" in window) window.requestIdleCallback(run, { timeout: 200 });
      else setTimeout(run, 16);
      return;
    }
    if (!e.url) {
      this.finish(e, null);
      return;
    }
    this.loader.load(
      e.url,
      (tex) => this.finish(e, tex),
      undefined,
      () => this.finish(e, null),
    );
  }

  dispose() {
    this.disposed = true;
    for (const e of this.entries.values()) e.texture?.dispose();
    this.entries.clear();
  }
}
