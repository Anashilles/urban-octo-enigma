"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  checkPlacement,
  frameFootprint,
  frameMetrics,
  outerSize,
  PLACEMENT_LIMITS,
  snapPlacement,
  type FramePlacement,
  type PlacementCheck,
} from "@/features/photo-placement/placement";
import type { SceneFrame, ScenePhoto, SceneRoom } from "@/features/museums/scene-types";
import { computeWallSpec, type WallKey } from "@/features/rooms/geometry";
import { useI18n } from "@/i18n/client";
import { photoImageUrl } from "@/components/museum/photo-urls";

export interface DraftPlacement {
  frameId: string | null;
  placement: FramePlacement;
  check: PlacementCheck;
  guides: { u?: number; v?: number };
}

interface Props {
  room: SceneRoom;
  wallKey: WallKey;
  wallColor: string;
  frames: SceneFrame[];
  photos: Map<string, ScenePhoto>;
  selectedFrameId: string | null;
  allowOverlap: boolean;
  editable: boolean;
  onSelect: (frameId: string | null) => void;
  /** Commit a move/resize; the parent persists it (and resolves invalid drops). */
  onCommit: (frameId: string, placement: FramePlacement, check: PlacementCheck) => void;
  onDropPhoto: (photoId: string, u: number, v: number) => void;
  onNudge: (frameId: string, du: number, dv: number) => void;
  onDelete: (frameId: string) => void;
}

const PAD = 0.25;

export function toPlacement(f: SceneFrame): FramePlacement & { id: string } {
  return { id: f.id, u: f.u, v: f.v, width: f.width, height: f.height, rotation: f.rotation, style: f.style, options: f.options };
}

export function WallElevation(props: Props) {
  const { t } = useI18n();
  const { room, wallKey, frames, photos, selectedFrameId, editable } = props;
  const spec = useMemo(() => computeWallSpec(room, wallKey), [room, wallKey]);
  const L = spec.length;
  const H = spec.height;
  const svgRef = useRef<SVGSVGElement>(null);
  const [draft, setDraft] = useState<DraftPlacement | null>(null);
  const drag = useRef<{ frameId: string; mode: "move" | "resize"; du: number; dv: number; start: FramePlacement } | null>(null);

  const toWall = useCallback(
    (clientX: number, clientY: number) => {
      const svg = svgRef.current;
      if (!svg) return { u: 0, v: 0 };
      const pt = svg.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
      return { u: p.x, v: H - p.y };
    },
    [H],
  );

  const others = useCallback((excludeId: string | null) => frames.filter((f) => f.id !== excludeId).map(toPlacement), [frames]);

  const evaluate = (frameId: string, candidate: FramePlacement, snap: boolean): DraftPlacement => {
    const rest = others(frameId);
    const snapped = snap ? snapPlacement(candidate, rest) : { placement: candidate, guides: {} };
    return {
      frameId,
      placement: snapped.placement,
      guides: snapped.guides,
      check: checkPlacement(spec.bounds, snapped.placement, rest, { allowOverlap: props.allowOverlap }),
    };
  };

  const onPointerDownFrame = (e: React.PointerEvent, f: SceneFrame, mode: "move" | "resize") => {
    e.stopPropagation();
    props.onSelect(f.id);
    if (!editable) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const p = toWall(e.clientX, e.clientY);
    drag.current = { frameId: f.id, mode, du: p.u - f.u, dv: p.v - f.v, start: toPlacement(f) };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const p = toWall(e.clientX, e.clientY);
    if (d.mode === "move") {
      setDraft(evaluate(d.frameId, { ...d.start, u: p.u - d.du, v: p.v - d.dv }, !e.altKey));
    } else {
      const m = frameMetrics(d.start.style, d.start.options);
      const half = Math.max(PLACEMENT_LIMITS.minSize / 2, p.u - d.start.u - m.border - m.mat);
      const width = Math.round(Math.min(PLACEMENT_LIMITS.maxWidth, half * 2) * 100) / 100;
      const aspect = d.start.width / d.start.height;
      setDraft(evaluate(d.frameId, { ...d.start, width, height: Math.round((width / aspect) * 1000) / 1000 }, false));
    }
  };

  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d || !draft || draft.frameId !== d.frameId) {
      setDraft(null);
      return;
    }
    const moved = draft.placement.u !== d.start.u || draft.placement.v !== d.start.v || draft.placement.width !== d.start.width;
    if (moved) props.onCommit(d.frameId, draft.placement, draft.check);
    setDraft(null);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!selectedFrameId || !editable) return;
    const step = e.shiftKey ? 0.25 : PLACEMENT_LIMITS.grid;
    const map: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (map[e.key]) {
      e.preventDefault();
      props.onNudge(selectedFrameId, ...map[e.key]!);
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      props.onDelete(selectedFrameId);
    } else if (e.key === "Escape") props.onSelect(null);
  };

  const y = (v: number) => H - v;
  const wallName = t(`editor.walls.${wallKey}`);

  return (
    <div
      dir="ltr"
      className="relative overflow-hidden rounded-2xl border border-border bg-[#e9e4da]"
      onDragOver={(e) => {
        if (editable && e.dataTransfer.types.includes("application/x-photo-id")) e.preventDefault();
      }}
      onDrop={(e) => {
        const photoId = e.dataTransfer.getData("application/x-photo-id");
        if (!photoId || !editable) return;
        e.preventDefault();
        const p = toWall(e.clientX, e.clientY);
        props.onDropPhoto(photoId, p.u, p.v);
      }}
      data-testid="wall-elevation"
    >
      <svg
        ref={svgRef}
        viewBox={`${-L / 2 - PAD} ${-PAD} ${L + 2 * PAD} ${H + 2 * PAD}`}
        className="block max-h-[62dvh] w-full touch-none outline-none focus-visible:ring-4 focus-visible:ring-ring/40"
        role="application"
        aria-label={t("editor.walls.wallLabel", { wall: wallName, room: room.name })}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerDown={() => props.onSelect(null)}
      >
        <defs>
          <pattern id="door-hatch" width="0.12" height="0.12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="0.12" height="0.12" fill="#cfc6b6" />
            <line x1="0" y1="0" x2="0" y2="0.12" stroke="#b5aa96" strokeWidth="0.03" />
          </pattern>
        </defs>
        {/* Wall */}
        <rect x={-L / 2} y={0} width={L} height={H} fill={props.wallColor} stroke="#bfb6a6" strokeWidth={0.015} />
        <line x1={-L / 2 - PAD} x2={L / 2 + PAD} y1={H} y2={H} stroke="#8f8574" strokeWidth={0.02} />
        {/* Usable area */}
        <rect
          x={spec.bounds.minU}
          y={y(spec.bounds.maxV)}
          width={spec.bounds.maxU - spec.bounds.minU}
          height={spec.bounds.maxV - spec.bounds.minV}
          fill="none"
          stroke="#a8988a"
          strokeWidth={0.01}
          strokeDasharray="0.05 0.05"
        />
        {/* Eye level */}
        <line x1={-L / 2} x2={L / 2} y1={y(PLACEMENT_LIMITS.eyeLevel)} y2={y(PLACEMENT_LIMITS.eyeLevel)} stroke="#c6a66a" strokeWidth={0.008} strokeDasharray="0.08 0.06" />
        <text x={-L / 2 + 0.06} y={y(PLACEMENT_LIMITS.eyeLevel) - 0.04} fontSize={0.09} fill="#a9884d">
          {t("editor.walls.eyeLevel")}
        </text>
        {/* Doorways */}
        {room.layout.doorways
          .filter((d) => d.wall === wallKey)
          .map((d) => (
            <g key={d.id}>
              <rect x={d.offset - d.width / 2} y={y(d.height)} width={d.width} height={d.height} fill="url(#door-hatch)" stroke="#9c907c" strokeWidth={0.015} />
              <text x={d.offset} y={y(d.height / 2)} fontSize={0.12} textAnchor="middle" fill="#6e6553">
                {t("editor.walls.doorway")}
              </text>
            </g>
          ))}
        {/* Guides */}
        {draft?.guides.v !== undefined && <line x1={-L / 2} x2={L / 2} y1={y(draft.guides.v)} y2={y(draft.guides.v)} stroke="#7b927d" strokeWidth={0.01} />}
        {draft?.guides.u !== undefined && <line x1={draft.guides.u} x2={draft.guides.u} y1={0} y2={H} stroke="#7b927d" strokeWidth={0.01} />}
        {/* Frames */}
        {frames.map((f) => {
          const isDraft = draft?.frameId === f.id;
          const p = isDraft ? draft.placement : toPlacement(f);
          const o = outerSize(p);
          const m = frameMetrics(p.style, p.options);
          const photo = photos.get(f.photoId);
          const url = photo ? photoImageUrl(photo, "thumb") : null;
          const selected = selectedFrameId === f.id;
          const invalid = isDraft && !draft.check.ok;
          const overlapping = isDraft && draft.check.ok && Boolean(draft.check.conflicts?.length);
          const cx = p.u;
          const cy = y(p.v);
          const fp = frameFootprint(p);
          return (
            <g key={f.id} data-testid="wall-frame" data-frame-id={f.id}>
              <g transform={`rotate(${-p.rotation} ${cx} ${cy})`} onPointerDown={(e) => onPointerDownFrame(e, f, "move")} style={{ cursor: editable ? "move" : "pointer" }}>
                <rect x={cx - o.width / 2} y={cy - o.height / 2 - o.centreDy} width={o.width} height={o.height} fill={m.border > 0 ? m.borderColor : m.matColor} />
                <rect
                  x={cx - p.width / 2 - m.mat}
                  y={cy - p.height / 2 - m.mat}
                  width={p.width + 2 * m.mat}
                  height={p.height + 2 * m.mat + m.matBottomExtra}
                  fill={m.matColor}
                />
                <rect x={cx - p.width / 2} y={cy - p.height / 2} width={p.width} height={p.height} fill={photo?.dominantColor ?? "#ccc"} />
                {url && <image href={url} x={cx - p.width / 2} y={cy - p.height / 2} width={p.width} height={p.height} preserveAspectRatio="none" />}
              </g>
              {(selected || isDraft) && (
                <rect
                  x={fp.minU - 0.03}
                  y={y(fp.maxV) - 0.03}
                  width={fp.maxU - fp.minU + 0.06}
                  height={fp.maxV - fp.minV + 0.06}
                  fill={invalid ? "rgba(201,79,79,0.18)" : "none"}
                  stroke={invalid ? "#c94f4f" : overlapping ? "#d08b2c" : "#c6a66a"}
                  strokeWidth={0.018}
                  pointerEvents="none"
                />
              )}
              {selected && editable && !isDraft && (
                <rect
                  x={cx + o.width / 2 - 0.05}
                  y={cy + o.height / 2 - o.centreDy - 0.05}
                  width={0.1}
                  height={0.1}
                  rx={0.02}
                  fill="#c6a66a"
                  stroke="#fff"
                  strokeWidth={0.012}
                  style={{ cursor: "nwse-resize" }}
                  onPointerDown={(e) => onPointerDownFrame(e, f, "resize")}
                  data-testid="resize-handle"
                />
              )}
            </g>
          );
        })}
      </svg>
      {draft && !draft.check.ok && draft.check.problem && (
        <p className="absolute start-3 bottom-3 rounded-full bg-destructive px-3 py-1 text-xs text-white" role="status">
          {t(`editor.walls.problems.${draft.check.problem}`)}
        </p>
      )}
      {draft?.check.ok && draft.check.conflicts?.length ? (
        <p className="absolute start-3 bottom-3 rounded-full bg-[#d08b2c] px-3 py-1 text-xs text-white" role="status">
          {t("editor.walls.overlapWarning")}
        </p>
      ) : null}
    </div>
  );
}
