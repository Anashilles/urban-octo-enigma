"use client";

/**
 * Procedural textures painted on <canvas> at runtime. Everything here is
 * original — no third-party image assets are shipped. Results are cached per
 * (kind, size) and shared across the scene.
 */
import * as THREE from "three";
import type { FloorMaterial } from "@/features/rooms/geometry";

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tileable 2D value noise with fractal octaves. */
export function makeNoise(seed: number, period = 64) {
  const rand = mulberry32(seed);
  const grid = new Float32Array(period * period);
  for (let i = 0; i < grid.length; i++) grid[i] = rand();
  const at = (x: number, y: number) => grid[(((y % period) + period) % period) * period + (((x % period) + period) % period)]!;
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const value = (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = smooth(x - xi);
    const yf = smooth(y - yi);
    const a = at(xi, yi);
    const b = at(xi + 1, yi);
    const c = at(xi, yi + 1);
    const d = at(xi + 1, yi + 1);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
  return (x: number, y: number, octaves = 4) => {
    let sum = 0;
    let amp = 0.5;
    let freq = 1;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += value(x * freq, y * freq) * amp;
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / norm;
  };
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  return [c, c.getContext("2d", { willReadFrequently: true })!];
}

function toTexture(c: HTMLCanvasElement, opts: { srgb?: boolean; repeat?: boolean } = {}) {
  const tex = new THREE.CanvasTexture(c);
  if (opts.srgb !== false) tex.colorSpace = THREE.SRGBColorSpace;
  if (opts.repeat !== false) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

/** Per-pixel painter over a tileable noise field. */
function paint(size: number, fn: (u: number, v: number) => [number, number, number]) {
  const [c, ctx] = canvas(size);
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, g, b] = fn(x / size, y / size);
      const i = (y * size + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function clamp255(n: number) {
  return Math.max(0, Math.min(255, n));
}

// ─── Floors ────────────────────────────────────────────────────────────────

function paintOak(size: number) {
  const [c, ctx] = canvas(size);
  const rand = mulberry32(11);
  const noise = makeNoise(5, 64);
  const planks = 11;
  const pw = size / planks;
  for (let p = 0; p < planks; p++) {
    let y = -rand() * size;
    while (y < size) {
      const len = size * (0.35 + rand() * 0.5);
      const tone = 0.88 + rand() * 0.2;
      const base = [203 * tone, 172 * tone, 132 * tone];
      const img = ctx.createImageData(Math.ceil(pw), Math.ceil(len));
      for (let yy = 0; yy < img.height; yy++) {
        for (let xx = 0; xx < img.width; xx++) {
          const n = noise((p * pw + xx) / 18, (y + yy) / 140 + p * 3, 3);
          const grain = Math.sin((xx / pw) * 22 + n * 9) * 0.5 + 0.5;
          const k = 0.86 + grain * 0.1 + (n - 0.5) * 0.18;
          const i = (yy * img.width + xx) * 4;
          img.data[i] = clamp255(base[0]! * k);
          img.data[i + 1] = clamp255(base[1]! * k);
          img.data[i + 2] = clamp255(base[2]! * k);
          img.data[i + 3] = 255;
        }
      }
      ctx.putImageData(img, Math.round(p * pw), Math.round(y));
      if (y + len - size > 0) ctx.putImageData(img, Math.round(p * pw), Math.round(y - size));
      ctx.fillStyle = "rgba(70,48,28,0.55)";
      ctx.fillRect(Math.round(p * pw), Math.round(y + len) % size, Math.ceil(pw), 1.5);
      y += len;
    }
    ctx.fillStyle = "rgba(60,40,24,0.6)";
    ctx.fillRect(Math.round(p * pw), 0, 1.5, size);
  }
  return c;
}

function paintHerringbone(size: number) {
  const [c, ctx] = canvas(size);
  const rand = mulberry32(23);
  const noise = makeNoise(9, 64);
  ctx.fillStyle = "#3b2a1e";
  ctx.fillRect(0, 0, size, size);
  // 2:1 herringbone as a staircase tiling: horizontal brick at ((k+4m)u, ku),
  // vertical brick at ((k+4m)u, (k+1)u). Periodic in 4u on both axes, so the
  // canvas (a multiple of 4u) tiles seamlessly.
  const u = size / 16;
  const drawBrick = (x: number, y: number, w: number, h: number, horizontal: boolean) => {
    const tone = 0.8 + rand() * 0.3;
    const img = ctx.createImageData(Math.round(w), Math.round(h));
    for (let yy = 0; yy < img.height; yy++) {
      for (let xx = 0; xx < img.width; xx++) {
        const along = horizontal ? xx : yy;
        const across = horizontal ? yy : xx;
        const n = noise((x + xx) / 28, (y + yy) / 28, 3);
        const grain = Math.sin(across * 0.85 + n * 10 + along * 0.015) * 0.5 + 0.5;
        const k = tone * (0.82 + grain * 0.14 + (n - 0.5) * 0.2);
        const i = (yy * img.width + xx) * 4;
        img.data[i] = clamp255(116 * k);
        img.data[i + 1] = clamp255(79 * k);
        img.data[i + 2] = clamp255(52 * k);
        img.data[i + 3] = 255;
      }
    }
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        const px = Math.round(x + ox);
        const py = Math.round(y + oy);
        if (px >= size || py >= size || px + w <= 0 || py + h <= 0) continue;
        ctx.putImageData(img, px, py);
        ctx.strokeStyle = "rgba(28,18,10,0.75)";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(px + 0.75, py + 0.75, w - 1.5, h - 1.5);
      }
    }
  };
  const n = size / u;
  for (let k = 0; k < n; k++) {
    for (let j = 0; j < n / 4; j++) {
      const x = (k + 4 * j) % n;
      drawBrick(x * u, k * u, 2 * u, u, true);
      drawBrick(x * u, ((k + 1) % n) * u, u, 2 * u, false);
    }
  }
  return c;
}

function paintConcrete(size: number) {
  const noise = makeNoise(3, 64);
  const speck = mulberry32(77);
  return paint(size, (u, v) => {
    const n = noise(u * 64, v * 64, 5);
    const m = noise(u * 8 + 10, v * 8, 3);
    const s = speck() < 0.004 ? -28 : 0;
    const g = 166 + (n - 0.5) * 34 + (m - 0.5) * 22 + s;
    return [g + 2, g + 1, g - 2];
  });
}

function paintMarble(size: number, dark: boolean) {
  const noise = makeNoise(dark ? 41 : 17, 64);
  const tiles = 2;
  return paint(size, (u, v) => {
    const turb = noise(u * 10, v * 10, 5);
    const vein = Math.abs(Math.sin((u * 3 + v * 1.4) * Math.PI * 2 + turb * 9));
    const fine = Math.abs(Math.sin((u * 7 - v * 5) * Math.PI * 2 + noise(u * 32 + 5, v * 32, 4) * 7));
    const veinK = Math.pow(1 - vein, 18) * 0.85 + Math.pow(1 - fine, 40) * 0.25;
    const cloud = noise(u * 6, v * 6, 4);
    // Subtle tile joints
    const tu = (u * tiles) % 1;
    const tv = (v * tiles) % 1;
    const joint = tu < 0.002 || tv < 0.002 ? 1 : 0;
    if (dark) {
      const base = 22 + cloud * 18;
      const r = base + veinK * 150;
      const g = base + veinK * 128;
      const b = base + veinK * 92;
      return joint ? [8, 8, 8] : [r, g, b];
    }
    const base = 236 + (cloud - 0.5) * 18;
    const r = base - veinK * 95;
    const g = base - veinK * 92;
    const b = base - veinK * 84;
    return joint ? [200, 196, 190] : [r, g, b];
  });
}

function paintTravertine(size: number) {
  const noise = makeNoise(29, 64);
  const pits = mulberry32(31);
  return paint(size, (u, v) => {
    const band = Math.sin(v * Math.PI * 2 * 9 + noise(u * 8, v * 8, 4) * 4) * 0.5 + 0.5;
    const n = noise(u * 40, v * 40, 4);
    const p = pits() < 0.003 ? -40 : 0;
    const k = 0.9 + band * 0.08 + (n - 0.5) * 0.1;
    const joint = (u * 2) % 1 < 0.002 || (v * 3) % 1 < 0.002;
    if (joint) return [180, 165, 140];
    return [clamp255(222 * k + p), clamp255(204 * k + p), clamp255(172 * k + p)];
  });
}

export interface FloorSpec {
  texture: THREE.Texture;
  /** World metres covered by one texture tile. */
  tileSize: number;
  roughness: number;
  metalness: number;
  envMapIntensity: number;
}

const cache = new Map<string, unknown>();

function cached<T>(key: string, make: () => T): T {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key) as T;
}

export function floorSpec(kind: FloorMaterial, size = 1024): FloorSpec {
  return cached(`floor:${kind}:${size}`, () => {
    switch (kind) {
      case "oak":
        return { texture: toTexture(paintOak(size)), tileSize: 2.4, roughness: 0.55, metalness: 0, envMapIntensity: 0.5 };
      case "walnut-herringbone":
        return { texture: toTexture(paintHerringbone(size)), tileSize: 3.2, roughness: 0.42, metalness: 0, envMapIntensity: 0.7 };
      case "concrete":
        return { texture: toTexture(paintConcrete(size / 2)), tileSize: 3.0, roughness: 0.62, metalness: 0, envMapIntensity: 0.5 };
      case "marble-white":
        return { texture: toTexture(paintMarble(size, false)), tileSize: 2.4, roughness: 0.16, metalness: 0, envMapIntensity: 1.0 };
      case "marble-black":
        return { texture: toTexture(paintMarble(size, true)), tileSize: 2.4, roughness: 0.12, metalness: 0, envMapIntensity: 1.1 };
      case "travertine":
        return { texture: toTexture(paintTravertine(size)), tileSize: 2.4, roughness: 0.7, metalness: 0, envMapIntensity: 0.4 };
    }
  });
}

/** Near-white plaster grain, multiplied with the wall colour. */
export function plasterTexture(size = 512): THREE.Texture {
  return cached(`plaster:${size}`, () => {
    const noise = makeNoise(13, 64);
    const c = paint(size, (u, v) => {
      const n = noise(u * 48, v * 48, 5);
      const m = noise(u * 6 + 4, v * 6, 3);
      const g = 244 + (n - 0.5) * 16 + (m - 0.5) * 12;
      return [g, g, g];
    });
    return toTexture(c);
  });
}

/** Soft radial light pool used for picture-light washes on walls. */
export function washTexture(): THREE.Texture {
  return cached("wash", () => {
    const [c, ctx] = canvas(256);
    const g = ctx.createRadialGradient(128, 70, 4, 128, 110, 140);
    g.addColorStop(0, "rgba(255,255,255,0.95)");
    g.addColorStop(0.35, "rgba(255,255,255,0.45)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    return toTexture(c, { repeat: false, srgb: false });
  });
}

/** Soft rectangular drop shadow behind frames. */
export function frameShadowTexture(): THREE.Texture {
  return cached("frame-shadow", () => {
    const [c, ctx] = canvas(128);
    ctx.filter = "blur(10px)";
    ctx.fillStyle = "rgba(0,0,0,1)";
    ctx.fillRect(22, 22, 84, 84);
    return toTexture(c, { repeat: false, srgb: false });
  });
}

/** Round contact shadow under avatars and furniture. */
export function blobShadowTexture(): THREE.Texture {
  return cached("blob", () => {
    const [c, ctx] = canvas(128);
    const g = ctx.createRadialGradient(64, 64, 2, 64, 64, 62);
    g.addColorStop(0, "rgba(0,0,0,0.55)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    return toTexture(c, { repeat: false, srgb: false });
  });
}

/** Caption plaque with the photo title (rendered lazily for nearby frames). */
export function plaqueTexture(title: string, subtitle: string, rtl: boolean): THREE.Texture {
  const [c, ctx] = canvas(512);
  c.height = 192;
  ctx.fillStyle = "#f6f3ec";
  ctx.fillRect(0, 0, 512, 192);
  ctx.fillStyle = "#242321";
  ctx.direction = rtl ? "rtl" : "ltr";
  ctx.textAlign = rtl ? "right" : "left";
  const x = rtl ? 482 : 30;
  ctx.font = "600 44px Georgia, 'Times New Roman', serif";
  const fit = (text: string, max: number) => {
    let t = text;
    while (ctx.measureText(t).width > max && t.length > 1) t = t.slice(0, -2) + "…";
    return t;
  };
  ctx.fillText(fit(title || " ", 452), x, 82);
  ctx.fillStyle = "#77736b";
  ctx.font = "400 30px Arial, sans-serif";
  ctx.fillText(fit(subtitle, 452), x, 140);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function rgbFromHex(hex: string) {
  return hexToRgb(hex);
}
