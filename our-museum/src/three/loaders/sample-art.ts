"use client";

/**
 * Procedurally painted sample artworks for the demo museum and previews.
 * They are deliberately abstract and are always labelled as samples.
 */
import type { SampleArtSpec } from "@/features/museums/scene-types";
import { makeNoise, mulberry32 } from "@/three/materials/textures";

type Ctx = CanvasRenderingContext2D;

function lerpColor(a: [number, number, number], b: [number, number, number], t: number) {
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`;
}

function sky(ctx: Ctx, w: number, h: number, stops: Array<[number, string]>) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  for (const [o, c] of stops) g.addColorStop(o, c);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function ridge(ctx: Ctx, w: number, h: number, baseY: number, amp: number, color: string, seed: number, rough = 1) {
  const n = makeNoise(seed, 32);
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let x = 0; x <= w; x += Math.max(2, w / 200)) {
    const y = baseY - n((x / w) * 6 * rough, seed % 7, 4) * amp;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function grain(ctx: Ctx, w: number, h: number, seed: number, strength = 10) {
  const img = ctx.getImageData(0, 0, w, h);
  const r = mulberry32(seed);
  for (let i = 0; i < img.data.length; i += 4) {
    const d = (r() - 0.5) * strength;
    img.data[i] = img.data[i]! + d;
    img.data[i + 1] = img.data[i + 1]! + d;
    img.data[i + 2] = img.data[i + 2]! + d;
  }
  ctx.putImageData(img, 0, 0);
}

export function paintSampleArt(spec: SampleArtSpec, width: number, height: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  const r = mulberry32(spec.seed);
  const w = width;
  const h = height;
  switch (spec.kind) {
    case "landscape": {
      sky(ctx, w, h, [
        [0, "#9fc3d8"],
        [0.55, "#f1dcc0"],
        [1, "#e8c9a2"],
      ]);
      ctx.fillStyle = "rgba(255,246,225,0.9)";
      ctx.beginPath();
      ctx.arc(w * (0.25 + r() * 0.5), h * 0.32, h * 0.06, 0, Math.PI * 2);
      ctx.fill();
      ridge(ctx, w, h, h * 0.6, h * 0.25, "#8ea7b5", spec.seed + 1);
      ridge(ctx, w, h, h * 0.7, h * 0.22, "#6e8a86", spec.seed + 2);
      ridge(ctx, w, h, h * 0.82, h * 0.15, "#4f6b5a", spec.seed + 3, 1.6);
      ridge(ctx, w, h, h * 0.95, h * 0.08, "#3a4f40", spec.seed + 4, 2.4);
      break;
    }
    case "sea": {
      sky(ctx, w, h, [
        [0, "#c9dde3"],
        [0.5, "#eef0e6"],
        [0.52, "#7fa4ad"],
        [1, "#2d5866"],
      ]);
      for (let i = 0; i < 70; i++) {
        const y = h * (0.53 + Math.pow(r(), 1.6) * 0.47);
        ctx.strokeStyle = `rgba(255,255,255,${0.08 + r() * 0.18})`;
        ctx.lineWidth = 1 + ((y - h * 0.5) / h) * 4;
        const x = r() * w;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + w * (0.05 + r() * 0.12), y);
        ctx.stroke();
      }
      ctx.fillStyle = "#3f3a36";
      const bx = w * (0.15 + r() * 0.6);
      ctx.beginPath();
      ctx.moveTo(bx, h * 0.5);
      ctx.lineTo(bx + w * 0.05, h * 0.5);
      ctx.lineTo(bx + w * 0.035, h * 0.515);
      ctx.lineTo(bx + w * 0.012, h * 0.515);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "sunset": {
      sky(ctx, w, h, [
        [0, "#3d3a5c"],
        [0.38, "#c96f6a"],
        [0.6, "#f2b37c"],
        [0.62, "#5b4458"],
        [1, "#2b2433"],
      ]);
      const sx = w * (0.3 + r() * 0.4);
      const g = ctx.createRadialGradient(sx, h * 0.6, 2, sx, h * 0.6, h * 0.35);
      g.addColorStop(0, "rgba(255,230,180,0.95)");
      g.addColorStop(0.15, "rgba(255,200,140,0.6)");
      g.addColorStop(1, "rgba(255,200,140,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 40; i++) {
        ctx.fillStyle = `rgba(255,${180 + r() * 50},${120 + r() * 60},${0.15 + r() * 0.25})`;
        const y = h * (0.63 + r() * 0.35);
        ctx.fillRect(sx - w * 0.15 * r(), y, w * 0.3 * r(), 1.5);
      }
      break;
    }
    case "garden": {
      sky(ctx, w, h, [
        [0, "#e6ecd9"],
        [1, "#c8d4b0"],
      ]);
      ridge(ctx, w, h, h * 0.62, h * 0.12, "#9cb08a", spec.seed + 5, 0.8);
      for (let i = 0; i < 26; i++) {
        const x = r() * w;
        const y = h * (0.45 + r() * 0.5);
        const s = h * (0.04 + r() * 0.09) * (y / h);
        ctx.fillStyle = lerpColor([62, 92, 66], [123, 146, 125], r());
        ctx.beginPath();
        ctx.ellipse(x, y, s, s * 1.3, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      for (let i = 0; i < 60; i++) {
        ctx.fillStyle = ["#e9c46a", "#f4a6a0", "#ffffff", "#d98aa8"][Math.floor(r() * 4)]!;
        ctx.beginPath();
        ctx.arc(r() * w, h * (0.75 + r() * 0.25), 1.5 + r() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case "night": {
      sky(ctx, w, h, [
        [0, "#141a2e"],
        [0.7, "#3b3557"],
        [1, "#5b4a62"],
      ]);
      for (let i = 0; i < 220; i++) {
        ctx.fillStyle = `rgba(255,255,240,${0.3 + r() * 0.7})`;
        ctx.fillRect(r() * w, r() * h * 0.7, r() < 0.1 ? 2 : 1, r() < 0.1 ? 2 : 1);
      }
      ctx.fillStyle = "#f4eed8";
      ctx.beginPath();
      ctx.arc(w * (0.2 + r() * 0.6), h * 0.25, h * 0.055, 0, Math.PI * 2);
      ctx.fill();
      ridge(ctx, w, h, h * 0.86, h * 0.1, "#1d1a26", spec.seed + 7, 1.4);
      break;
    }
    case "dunes": {
      sky(ctx, w, h, [
        [0, "#f3dcb4"],
        [0.5, "#f7e9cf"],
        [1, "#e4b27a"],
      ]);
      for (let i = 0; i < 4; i++) {
        ridge(ctx, w, h, h * (0.55 + i * 0.12), h * 0.14, lerpColor([226, 173, 112], [176, 116, 64], i / 3), spec.seed + 10 + i, 0.6);
      }
      break;
    }
    case "city": {
      sky(ctx, w, h, [
        [0, "#a9b8c9"],
        [0.7, "#e9d7c6"],
        [1, "#d8b9a4"],
      ]);
      let x = 0;
      while (x < w) {
        const bw = w * (0.04 + r() * 0.08);
        const bh = h * (0.2 + r() * 0.45);
        ctx.fillStyle = lerpColor([86, 92, 110], [140, 140, 150], r());
        ctx.fillRect(x, h - bh, bw, bh);
        ctx.fillStyle = "rgba(255,236,190,0.55)";
        for (let wy = h - bh + 6; wy < h - 6; wy += 10) for (let wx = x + 4; wx < x + bw - 4; wx += 8) if (r() < 0.3) ctx.fillRect(wx, wy, 3, 4);
        x += bw + 1;
      }
      break;
    }
    case "abstract":
    default: {
      const palettes: Array<[string, string, string]> = [
        ["#c96f4a", "#e9c46a", "#2a3d45"],
        ["#7b927d", "#e8dcc4", "#3d405b"],
        ["#b56576", "#eaac8b", "#355070"],
        ["#c6a66a", "#f2ebdc", "#242321"],
      ];
      const [a, b, cc] = palettes[spec.seed % palettes.length]!;
      ctx.fillStyle = b;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 0.92;
      ctx.fillStyle = a;
      ctx.fillRect(w * 0.08, h * 0.08, w * 0.84, h * (0.35 + r() * 0.15));
      ctx.fillStyle = cc;
      ctx.fillRect(w * 0.08, h * 0.6, w * 0.84, h * 0.32);
      ctx.globalAlpha = 1;
      ctx.filter = "blur(2px)";
      ctx.drawImage(c, 0, 0);
      ctx.filter = "none";
      break;
    }
  }
  grain(ctx, w, h, spec.seed, 9);
  return c;
}

export const SAMPLE_KINDS: SampleArtSpec["kind"][] = ["landscape", "sea", "sunset", "garden", "night", "abstract", "dunes", "city"];
