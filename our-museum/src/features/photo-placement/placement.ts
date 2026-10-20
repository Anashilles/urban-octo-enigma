/**
 * Picture-frame geometry and wall-placement rules. Shared by the 3D scene, the
 * 2D wall editor and PhotoPlacementService (which is authoritative).
 */
import { z } from "zod";
import type { PlacementBounds, UVRect } from "@/features/rooms/geometry";

export const FRAME_STYLES = [
  "minimal-black",
  "natural-wood",
  "white-gallery",
  "champagne-gold",
  "frameless-canvas",
  "polaroid",
  "custom",
] as const;
export type FrameStyle = (typeof FRAME_STYLES)[number];

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const frameOptionsSchema = z.object({
  /** Mat (passe-partout) width in metres; 0 disables the mat. */
  matWidth: z.number().min(0).max(0.25).optional(),
  matColor: hexColor.optional(),
  /** Only for the custom style. */
  borderWidth: z.number().min(0.005).max(0.12).optional(),
  borderColor: hexColor.optional(),
  showPlaque: z.boolean().optional(),
});
export type FrameOptions = z.infer<typeof frameOptionsSchema>;

export interface FrameStyleSpec {
  /** Moulding width around the mat. */
  border: number;
  /** How far the frame stands off the wall. */
  depth: number;
  /** Default mat width. */
  mat: number;
  /** Extra mat below the photo (polaroid). */
  matBottomExtra: number;
  borderColor: string;
  matColor: string;
  /** Material hints for the renderer. */
  metalness: number;
  roughness: number;
}

export const FRAME_STYLE_SPECS: Record<FrameStyle, FrameStyleSpec> = {
  "minimal-black": { border: 0.025, depth: 0.035, mat: 0.06, matBottomExtra: 0, borderColor: "#1b1a19", matColor: "#f7f4ee", metalness: 0.1, roughness: 0.55 },
  "natural-wood": { border: 0.045, depth: 0.045, mat: 0.07, matBottomExtra: 0, borderColor: "#8a6440", matColor: "#f4efe5", metalness: 0, roughness: 0.7 },
  "white-gallery": { border: 0.032, depth: 0.045, mat: 0.08, matBottomExtra: 0, borderColor: "#f3f1ec", matColor: "#fbfaf7", metalness: 0, roughness: 0.6 },
  "champagne-gold": { border: 0.06, depth: 0.055, mat: 0.07, matBottomExtra: 0, borderColor: "#c6a66a", matColor: "#f2ebdc", metalness: 0.85, roughness: 0.32 },
  "frameless-canvas": { border: 0, depth: 0.035, mat: 0, matBottomExtra: 0, borderColor: "#e9e6e0", matColor: "#ffffff", metalness: 0, roughness: 0.8 },
  polaroid: { border: 0, depth: 0.006, mat: 0.035, matBottomExtra: 0.09, borderColor: "#fbfaf6", matColor: "#fbfaf6", metalness: 0, roughness: 0.75 },
  custom: { border: 0.035, depth: 0.04, mat: 0.06, matBottomExtra: 0, borderColor: "#3a2f27", matColor: "#f7f4ee", metalness: 0.1, roughness: 0.6 },
};

export const PLACEMENT_LIMITS = {
  minSize: 0.15,
  maxWidth: 3.2,
  maxHeight: 2.6,
  maxRotation: 10,
  /** Minimum clear gap between neighbouring frames. */
  minGap: 0.05,
  grid: 0.05,
  eyeLevel: 1.55,
  snapThreshold: 0.07,
  plaqueDrop: 0.13,
} as const;

export interface FramePlacement {
  u: number;
  v: number;
  width: number;
  height: number;
  rotation: number;
  style: FrameStyle;
  options?: FrameOptions;
}

export type FrameRect = UVRect;

/** Resolved border/mat sizes for a frame. */
export function frameMetrics(style: FrameStyle, options: FrameOptions = {}) {
  const spec = FRAME_STYLE_SPECS[style];
  const border = style === "custom" ? (options.borderWidth ?? spec.border) : spec.border;
  const mat = style === "frameless-canvas" ? 0 : style === "polaroid" ? spec.mat : (options.matWidth ?? spec.mat);
  return {
    border,
    mat,
    matBottomExtra: spec.matBottomExtra,
    depth: spec.depth,
    borderColor: style === "custom" ? (options.borderColor ?? spec.borderColor) : spec.borderColor,
    matColor: options.matColor ?? spec.matColor,
    metalness: spec.metalness,
    roughness: spec.roughness,
  };
}

/** Outer frame size (including border and mat) for a printed photo size. */
export function outerSize(p: Pick<FramePlacement, "width" | "height" | "style" | "options">) {
  const m = frameMetrics(p.style, p.options);
  return {
    width: p.width + 2 * (m.border + m.mat),
    height: p.height + 2 * (m.border + m.mat) + m.matBottomExtra,
    /** Vertical offset of the outer rect's centre relative to the photo centre. */
    centreDy: -m.matBottomExtra / 2,
  };
}

/** Wall-space bounding box of a frame, including tilt and its caption plaque. */
export function frameFootprint(p: FramePlacement): FrameRect {
  const o = outerSize(p);
  const cx = p.u;
  const cy = p.v + o.centreDy;
  const r = (Math.abs(p.rotation) * Math.PI) / 180;
  const hw = (o.width * Math.cos(r) + o.height * Math.sin(r)) / 2;
  const hh = (o.width * Math.sin(r) + o.height * Math.cos(r)) / 2;
  const plaque = p.options?.showPlaque ? PLACEMENT_LIMITS.plaqueDrop : 0;
  return { minU: cx - hw, maxU: cx + hw, minV: cy - hh - plaque, maxV: cy + hh };
}

function intersects(a: UVRect, b: UVRect, gap = 0): boolean {
  return a.minU < b.maxU + gap && a.maxU > b.minU - gap && a.minV < b.maxV + gap && a.maxV > b.minV - gap;
}

export type PlacementProblem =
  | "too_small"
  | "too_large"
  | "rotation_limit"
  | "out_of_bounds"
  | "overlaps_doorway"
  | "overlaps_frame";

export interface PlacementCheck {
  ok: boolean;
  problem?: PlacementProblem;
  /** Ids of frames this placement collides with. */
  conflicts?: string[];
}

export function checkPlacement(
  bounds: PlacementBounds,
  candidate: FramePlacement,
  others: Array<FramePlacement & { id: string }>,
  opts: { allowOverlap?: boolean } = {},
): PlacementCheck {
  if (candidate.width < PLACEMENT_LIMITS.minSize || candidate.height < PLACEMENT_LIMITS.minSize) return { ok: false, problem: "too_small" };
  if (candidate.width > PLACEMENT_LIMITS.maxWidth || candidate.height > PLACEMENT_LIMITS.maxHeight) return { ok: false, problem: "too_large" };
  if (Math.abs(candidate.rotation) > PLACEMENT_LIMITS.maxRotation + 1e-9) return { ok: false, problem: "rotation_limit" };
  const fp = frameFootprint(candidate);
  const e = 1e-6;
  if (fp.minU < bounds.minU - e || fp.maxU > bounds.maxU + e || fp.minV < bounds.minV - e || fp.maxV > bounds.maxV + e) {
    return { ok: false, problem: "out_of_bounds" };
  }
  if (bounds.exclusions.some((x) => intersects(fp, x))) return { ok: false, problem: "overlaps_doorway" };
  const conflicts = others.filter((o) => intersects(fp, frameFootprint(o), PLACEMENT_LIMITS.minGap - e)).map((o) => o.id);
  if (conflicts.length && !opts.allowOverlap) return { ok: false, problem: "overlaps_frame", conflicts };
  return { ok: true, conflicts: conflicts.length ? conflicts : undefined };
}

/** Printed size for a photo with the given aspect ratio (w/h), fitted to limits. */
export function sizeForAspect(aspect: number, targetWidth: number, maxHeight: number = PLACEMENT_LIMITS.maxHeight): { width: number; height: number } {
  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  let width = Math.min(Math.max(targetWidth, PLACEMENT_LIMITS.minSize), PLACEMENT_LIMITS.maxWidth);
  let height = width / a;
  if (height > maxHeight) {
    height = maxHeight;
    width = height * a;
  }
  if (height < PLACEMENT_LIMITS.minSize) {
    height = PLACEMENT_LIMITS.minSize;
    width = Math.min(height * a, PLACEMENT_LIMITS.maxWidth);
  }
  return { width: round3(width), height: round3(width / a) };
}

/** A pleasant default print width for a photo on a wall of the given height. */
export function defaultPrintWidth(aspect: number, wallHeight: number): number {
  const portrait = aspect < 1;
  const base = portrait ? 0.8 : 1.15;
  return Math.min(base, (wallHeight - 1.2) * aspect);
}

function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}

function snapTo(value: number, step: number) {
  return Math.round(value / step) * step;
}

/**
 * Snaps a candidate to the grid, the eye-level line, the wall centre and
 * neighbouring frames' alignment lines. Returns the snapped placement and the
 * guide lines that were used (for the editor overlay).
 */
export function snapPlacement(
  candidate: FramePlacement,
  others: FramePlacement[],
  opts: { grid?: boolean } = {},
): { placement: FramePlacement; guides: { u?: number; v?: number } } {
  const T = PLACEMENT_LIMITS.snapThreshold;
  let { u, v } = candidate;
  const guides: { u?: number; v?: number } = {};
  if (opts.grid !== false) {
    u = snapTo(u, PLACEMENT_LIMITS.grid);
    v = snapTo(v, PLACEMENT_LIMITS.grid);
  }
  const vTargets = [PLACEMENT_LIMITS.eyeLevel, ...others.map((o) => o.v)];
  const uTargets = [0, ...others.map((o) => o.u)];
  const nearestV = vTargets.reduce<number | null>((best, t) => (Math.abs(candidate.v - t) < T && (best === null || Math.abs(candidate.v - t) < Math.abs(candidate.v - best)) ? t : best), null);
  const nearestU = uTargets.reduce<number | null>((best, t) => (Math.abs(candidate.u - t) < T && (best === null || Math.abs(candidate.u - t) < Math.abs(candidate.u - best)) ? t : best), null);
  if (nearestV !== null) {
    v = nearestV;
    guides.v = nearestV;
  }
  if (nearestU !== null) {
    u = nearestU;
    guides.u = nearestU;
  }
  return { placement: { ...candidate, u: round3(u), v: round3(v) }, guides };
}

/**
 * Finds the nearest valid position to a candidate by searching outward on the
 * snapping grid. Returns null when nothing fits within `maxRadius` metres.
 */
export function nearestValidPlacement(
  bounds: PlacementBounds,
  candidate: FramePlacement,
  others: Array<FramePlacement & { id: string }>,
  maxRadius = 1.5,
): FramePlacement | null {
  if (checkPlacement(bounds, candidate, others).ok) return candidate;
  const step = PLACEMENT_LIMITS.grid;
  const rings = Math.ceil(maxRadius / step);
  let best: FramePlacement | null = null;
  let bestDist = Infinity;
  for (let ring = 1; ring <= rings; ring++) {
    for (let i = -ring; i <= ring; i++) {
      for (const [du, dv] of [
        [i, -ring],
        [i, ring],
        [-ring, i],
        [ring, i],
      ] as const) {
        const p = { ...candidate, u: round3(candidate.u + du * step), v: round3(candidate.v + dv * step) };
        const d = Math.hypot(du, dv * 1.4);
        if (d < bestDist && checkPlacement(bounds, p, others).ok) {
          best = p;
          bestDist = d;
        }
      }
    }
    if (best) return best;
  }
  return null;
}

/**
 * Finds a free spot for a new frame on a wall — eye level first, spreading
 * outward from the centre, then other heights. Optionally shrinks the frame.
 */
export function findFreeSpot(
  bounds: PlacementBounds,
  size: Pick<FramePlacement, "width" | "height" | "style" | "options">,
  others: Array<FramePlacement & { id: string }>,
): FramePlacement | null {
  const aspect = size.width / size.height;
  for (const scale of [1, 0.8, 0.62, 0.48]) {
    const width = round3(size.width * scale);
    const height = round3(width / aspect);
    if (width < PLACEMENT_LIMITS.minSize || height < PLACEMENT_LIMITS.minSize) break;
    const centreV = Math.min(Math.max(PLACEMENT_LIMITS.eyeLevel, bounds.minV + height / 2 + 0.2), bounds.maxV - height / 2 - 0.1);
    const span = bounds.maxU - bounds.minU;
    const offsets = [0];
    for (let d = PLACEMENT_LIMITS.grid; d <= span / 2; d += PLACEMENT_LIMITS.grid) offsets.push(d, -d);
    for (const dv of [0, 0.35, -0.3, 0.7]) {
      for (const du of offsets) {
        const p: FramePlacement = { ...size, width, height, rotation: 0, u: round3((bounds.minU + bounds.maxU) / 2 + du), v: round3(centreV + dv) };
        if (checkPlacement(bounds, p, others).ok) return p;
      }
    }
  }
  return null;
}
