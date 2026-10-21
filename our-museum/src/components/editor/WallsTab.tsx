"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { BoxIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Slider, Switch } from "@/components/ui/controls";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { roomWallColor } from "@/three/rooms/Architecture";
import {
  checkPlacement,
  defaultPrintWidth,
  findFreeSpot,
  FRAME_STYLES,
  frameMetrics,
  nearestValidPlacement,
  PLACEMENT_LIMITS,
  sizeForAspect,
  snapPlacement,
  type FrameOptions,
  type FramePlacement,
  type FrameStyle,
  type PlacementCheck,
} from "@/features/photo-placement/placement";
import type { SceneFrame } from "@/features/museums/scene-types";
import { computeWallSpec, WALL_KEYS, wallLength, type WallKey } from "@/features/rooms/geometry";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { useMuseumStore } from "@/store/museum-store";
import { photoImageUrl } from "@/components/museum/photo-urls";
import { useEditor } from "./editor-context";
import { useEditorSelection } from "./selection";
import { toPlacement, WallElevation } from "./WallElevation";

const Preview3D = dynamic(() => import("./Preview3D"), { ssr: false });

const MAT_COLORS = ["#fbfaf7", "#f2ebdc", "#e9e4d8", "#2a2826", "#141312"];
const BORDER_COLORS = ["#1b1a19", "#3a2f27", "#8a6440", "#c6a66a", "#f3f1ec", "#7b927d"];

function FrameProperties({ frame, onChange, onRemove }: { frame: SceneFrame; onChange: (patch: Partial<FramePlacement> & { caption?: string | null; allowOverlap?: boolean }) => void; onRemove: () => void }) {
  const { t, formatNumber } = useI18n();
  const m = frameMetrics(frame.style, frame.options);
  const [width, setWidth] = useState(frame.width);
  const [tilt, setTilt] = useState(frame.rotation);
  const [mat, setMat] = useState(m.mat);
  const [caption, setCaption] = useState(frame.caption ?? "");
  const aspect = frame.width / frame.height;
  const timer = useRef<number | null>(null);
  const debounced = (patch: Parameters<typeof onChange>[0]) => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => onChange(patch), 350);
  };
  const opts = (patch: Partial<FrameOptions>) => onChange({ options: { ...frame.options, ...patch } });
  const cm = (n: number) => `${formatNumber(Math.round(n * 100))} cm`;

  return (
    <div className="grid gap-5" data-testid="frame-properties">
      <h2 className="font-display text-2xl">{t("editor.walls.frame")}</h2>
      <div className="grid gap-2">
        <div className="flex justify-between text-sm">
          <Label htmlFor="fw">{t("editor.walls.width")}</Label>
          <span className="text-muted-foreground">
            {cm(width)} × {cm(width / aspect)}
          </span>
        </div>
        <Slider id="fw" min={PLACEMENT_LIMITS.minSize} max={Math.min(PLACEMENT_LIMITS.maxWidth, PLACEMENT_LIMITS.maxHeight * aspect)} step={0.01} value={[width]} onValueChange={([v]) => {
          setWidth(v!);
          debounced({ width: v! });
        }} />
      </div>
      <div className="grid gap-2">
        <div className="flex justify-between text-sm">
          <Label htmlFor="ft">{t("editor.walls.tilt")}</Label>
          <span className="text-muted-foreground">{formatNumber(tilt)}°</span>
        </div>
        <Slider id="ft" min={-PLACEMENT_LIMITS.maxRotation} max={PLACEMENT_LIMITS.maxRotation} step={0.5} value={[tilt]} onValueChange={([v]) => {
          setTilt(v!);
          debounced({ rotation: v! });
        }} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="fstyle">{t("editor.walls.style")}</Label>
        <Select value={frame.style} onValueChange={(v) => onChange({ style: v as FrameStyle })}>
          <SelectTrigger id="fstyle" data-testid="frame-style">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FRAME_STYLES.map((s) => (
              <SelectItem key={s} value={s}>
                {t(`editor.walls.styles.${s}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {frame.style !== "frameless-canvas" && frame.style !== "polaroid" && (
        <>
          <div className="grid gap-2">
            <div className="flex justify-between text-sm">
              <Label htmlFor="fmat">{t("editor.walls.mat")}</Label>
              <span className="text-muted-foreground">{cm(mat)}</span>
            </div>
            <Slider id="fmat" min={0} max={0.2} step={0.005} value={[mat]} onValueChange={([v]) => {
              setMat(v!);
              debounced({ options: { ...frame.options, matWidth: v! } });
            }} />
          </div>
          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">{t("editor.walls.matColor")}</legend>
            <div className="flex gap-2">
              {MAT_COLORS.map((c) => (
                <button key={c} type="button" aria-label={c} aria-pressed={m.matColor === c} onClick={() => opts({ matColor: c })} className={cn("size-8 rounded-full border", m.matColor === c && "ring-2 ring-gold ring-offset-2")} style={{ background: c }} />
              ))}
            </div>
          </fieldset>
        </>
      )}
      {frame.style === "custom" && (
        <fieldset className="grid gap-2">
          <legend className="text-sm font-medium">{t("editor.walls.borderColor")}</legend>
          <div className="flex gap-2">
            {BORDER_COLORS.map((c) => (
              <button key={c} type="button" aria-label={c} aria-pressed={m.borderColor === c} onClick={() => opts({ borderColor: c })} className={cn("size-8 rounded-full border", m.borderColor === c && "ring-2 ring-gold ring-offset-2")} style={{ background: c }} />
            ))}
          </div>
        </fieldset>
      )}
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor="fplaque">{t("editor.walls.plaque")}</Label>
        <Switch id="fplaque" checked={Boolean(frame.options.showPlaque)} onCheckedChange={(v) => opts({ showPlaque: v })} />
      </div>
      {frame.options.showPlaque && (
        <div className="grid gap-2">
          <Label htmlFor="fcaption">{t("editor.walls.plaqueText")}</Label>
          <Input id="fcaption" value={caption} maxLength={120} onChange={(e) => setCaption(e.target.value)} onBlur={() => caption !== (frame.caption ?? "") && onChange({ caption: caption || null })} />
          <p className="text-xs text-muted-foreground">{t("editor.walls.plaqueTextHint")}</p>
        </div>
      )}
      <Button variant="ghost" className="justify-self-start text-destructive" onClick={onRemove} data-testid="remove-frame">
        <Trash2Icon aria-hidden="true" />
        {t("editor.walls.remove")}
      </Button>
    </div>
  );
}

export function WallsTab() {
  const { t, formatNumber } = useI18n();
  const { scene, museumId, mutate, refresh, errorText } = useEditor();
  const sel = useEditorSelection();
  const [allowOverlap, setAllowOverlap] = useState(false);
  const [preview, setPreview] = useState(false);
  const editable = scene.viewer.permissions["frame.place"];
  const rooms = useMemo(() => [...scene.rooms].sort((a, b) => a.sortOrder - b.sortOrder), [scene.rooms]);
  const room = rooms.find((r) => r.id === sel.roomId) ?? rooms[0]!;
  const wallKey = sel.wallKey;
  const spec = useMemo(() => computeWallSpec(room, wallKey), [room, wallKey]);
  const wallFrames = scene.frames.filter((f) => f.roomId === room.id && f.wallKey === wallKey);
  const photos = useMemo(() => new Map(scene.photos.map((p) => [p.id, p])), [scene.photos]);
  const selectedFrame = scene.frames.find((f) => f.id === sel.frameId) ?? null;
  const patchScene = useMuseumStore((s) => s.patchScene);
  const saveQueue = useRef(new Map<string, Promise<void>>());
  const knownVersion = useRef(new Map<string, number>());

  useEffect(() => {
    if (!sel.roomId && rooms[0]) sel.set({ roomId: rooms[0].id });
  }, [sel, rooms]);

  const others = (excludeId: string | null) => wallFrames.filter((f) => f.id !== excludeId).map(toPlacement);

  /** Optimistically updates a frame locally, then persists (server re-validates). */
  const saveFrame = async (frameId: string, patch: Partial<FramePlacement> & { caption?: string | null; allowOverlap?: boolean }) => {
    const before = scene.frames.find((f) => f.id === frameId);
    if (!before) return;
    patchScene((s) => ({
      ...s,
      frames: s.frames.map((f) =>
        f.id === frameId
          ? {
              ...f,
              ...("u" in patch ? { u: patch.u! } : {}),
              ...("v" in patch ? { v: patch.v! } : {}),
              ...("width" in patch ? { width: patch.width!, height: patch.width! * (f.height / f.width) } : {}),
              ...("rotation" in patch ? { rotation: patch.rotation! } : {}),
              ...("style" in patch ? { style: patch.style! } : {}),
              ...("options" in patch ? { options: patch.options! } : {}),
              ...("caption" in patch ? { caption: patch.caption ?? null } : {}),
            }
          : f,
      ),
    }));
    // One save per frame at a time, each based on the newest version we know of
    // (our own last save or a refreshed scene), so quick successive edits never
    // collide with each other — only with someone else's change.
    const previous = saveQueue.current.get(frameId) ?? Promise.resolve();
    const run = previous.then(async () => {
      const known = [useMuseumStore.getState().scene?.frames.find((f) => f.id === frameId)?.version, knownVersion.current.get(frameId)];
      const versions = known.filter((v): v is number => typeof v === "number" && v > 0);
      const expectedVersion = versions.length ? Math.max(...versions) : undefined;
      try {
        const saved = await mutate<{ version: number }>(`/api/museums/${museumId}/frames/${frameId}`, {
          method: "PATCH",
          body: { ...patch, height: undefined, allowOverlap: allowOverlap || undefined, expectedVersion },
        });
        knownVersion.current.set(frameId, saved.version);
      } catch (e) {
        toast.error(errorText(e));
        // Drop the optimistic change and show what is actually saved.
        await refresh().catch(() => undefined);
      }
    });
    saveQueue.current.set(frameId, run);
    await run;
  };

  const commitMove = (frameId: string, placement: FramePlacement, check: PlacementCheck) => {
    let final = placement;
    if (!check.ok) {
      const fixed = nearestValidPlacement(spec.bounds, placement, others(frameId));
      if (!fixed) {
        toast.error(t(`editor.walls.problems.${check.problem!}`));
        return;
      }
      final = fixed;
      toast(t("editor.walls.moved"));
    }
    void saveFrame(frameId, { u: final.u, v: final.v, width: final.width });
  };

  const placePhoto = async (photoId: string, at?: { u: number; v: number }) => {
    const photo = photos.get(photoId);
    if (!photo) return;
    const aspect = photo.width / photo.height;
    const size = sizeForAspect(aspect, defaultPrintWidth(aspect, room.height), Math.min(1.9, room.height - 1.3));
    const style = scene.theme.defaultFrameStyle;
    const options: FrameOptions = { showPlaque: Boolean(photo.title) };
    let placement: FramePlacement | null = null;
    if (at) {
      const snapped = snapPlacement({ ...size, u: at.u, v: at.v, rotation: 0, style, options }, others(null)).placement;
      placement = checkPlacement(spec.bounds, snapped, others(null)).ok ? snapped : nearestValidPlacement(spec.bounds, snapped, others(null));
    }
    placement ??= findFreeSpot(spec.bounds, { ...size, style, options }, others(null));
    if (!placement) {
      toast.error(t("editor.walls.noSpace"));
      return;
    }
    try {
      const frame = await mutate<{ id: string }>(`/api/museums/${museumId}/frames`, {
        method: "POST",
        body: { photoId, roomId: room.id, wallKey, u: placement.u, v: placement.v, width: placement.width, rotation: 0, style, options },
      });
      sel.set({ frameId: frame.id });
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  const removeFrame = async (frameId: string) => {
    sel.set({ frameId: null });
    patchScene((s) => ({ ...s, frames: s.frames.filter((f) => f.id !== frameId) }));
    await mutate(`/api/museums/${museumId}/frames/${frameId}`, { method: "DELETE" }).catch((e) => toast.error(errorText(e)));
  };

  const nudge = (frameId: string, du: number, dv: number) => {
    const f = wallFrames.find((x) => x.id === frameId);
    if (!f) return;
    const candidate = { ...toPlacement(f), u: Math.round((f.u + du) * 1000) / 1000, v: Math.round((f.v + dv) * 1000) / 1000 };
    const check = checkPlacement(spec.bounds, candidate, others(frameId), { allowOverlap });
    if (!check.ok) {
      toast.error(t(`editor.walls.problems.${check.problem!}`));
      return;
    }
    void saveFrame(frameId, { u: candidate.u, v: candidate.v });
  };

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="wall-room">{t("editor.walls.room")}</Label>
          <Select value={room.id} onValueChange={(v) => sel.set({ roomId: v, frameId: null })}>
            <SelectTrigger id="wall-room" className="min-w-56" data-testid="wall-room-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {rooms.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <span className="text-sm font-medium">{t("editor.walls.wall")}</span>
          <div className="inline-flex rounded-full bg-muted p-1" role="radiogroup" aria-label={t("editor.walls.wall")}>
            {WALL_KEYS.map((w) => (
              <button
                key={w}
                type="button"
                role="radio"
                aria-checked={w === wallKey}
                onClick={() => sel.set({ wallKey: w as WallKey, frameId: null })}
                className={cn("rounded-full px-3.5 py-1.5 text-sm whitespace-nowrap", w === wallKey ? "bg-card font-medium shadow-sm" : "text-muted-foreground")}
                data-testid={`wall-${w}`}
              >
                {t(`editor.walls.${w}`)} <span className="text-xs text-muted-foreground">· {t("editor.walls.length", { length: formatNumber(wallLength(room, w)) })}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="ms-auto flex items-center gap-3">
          {editable && (
            <div className="flex items-center gap-2">
              <Switch id="overlap" checked={allowOverlap} onCheckedChange={setAllowOverlap} />
              <Label htmlFor="overlap" className="font-normal">
                {t("editor.walls.allowOverlap")}
              </Label>
            </div>
          )}
          <Button variant={preview ? "default" : "outline"} onClick={() => setPreview((p) => !p)} data-testid="toggle-3d">
            {preview ? <XIcon aria-hidden="true" /> : <BoxIcon aria-hidden="true" />}
            {t("editor.walls.view3d")}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid content-start gap-3">
          {preview ? (
            <Preview3D roomId={room.id} wallKey={wallKey} />
          ) : (
            <WallElevation
              room={room}
              wallKey={wallKey}
              wallColor={roomWallColor(room, scene.theme)}
              frames={wallFrames}
              photos={photos}
              selectedFrameId={sel.frameId}
              allowOverlap={allowOverlap}
              editable={editable}
              onSelect={(id) => sel.set({ frameId: id })}
              onCommit={commitMove}
              onDropPhoto={(photoId, u, v) => void placePhoto(photoId, { u, v })}
              onNudge={nudge}
              onDelete={(id) => void removeFrame(id)}
            />
          )}
          <p className="text-xs text-muted-foreground">{t("editor.walls.keyboardHint")}</p>
        </div>
        <aside className="xl:sticky xl:top-24 xl:self-start">
          {selectedFrame && editable ? (
            <FrameProperties
              key={`${selectedFrame.id}:${selectedFrame.style}:${selectedFrame.width}:${selectedFrame.rotation}`}
              frame={selectedFrame}
              onChange={(patch) => void saveFrame(selectedFrame.id, patch)}
              onRemove={() => void removeFrame(selectedFrame.id)}
            />
          ) : (
            <p className="rounded-xl border border-dashed border-input p-6 text-sm text-muted-foreground">{t("editor.walls.selectFrame")}</p>
          )}
        </aside>
      </div>

      {editable && (
        <section aria-labelledby="library-title" className="grid gap-3">
          <div>
            <h2 id="library-title" className="font-display text-2xl">
              {t("editor.walls.library")}
            </h2>
            <p className="text-sm text-muted-foreground">{t("editor.walls.libraryHint")}</p>
          </div>
          <ul className="flex gap-3 overflow-x-auto pb-2" data-testid="wall-library">
            {[...scene.photos].reverse().map((p) => {
              const url = photoImageUrl(p, "thumb");
              const active = sel.photoId === p.id;
              return (
                <li key={p.id} className="w-32 shrink-0">
                  <button
                    type="button"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("application/x-photo-id", p.id);
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                    onClick={() => sel.set({ photoId: p.id })}
                    className={cn("block w-full overflow-hidden rounded-lg border text-start", active ? "border-gold ring-2 ring-gold/40" : "border-border")}
                    data-testid="library-photo"
                  >
                    <div className="aspect-square" style={{ background: p.dominantColor }}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- signed short-lived URL */}
                      {url && <img src={url} alt="" className="size-full object-cover" draggable={false} />}
                    </div>
                    <span className="block truncate px-2 py-1 text-xs">{p.title || t("common.untitled")}</span>
                  </button>
                  {active && (
                    <Button size="sm" className="mt-1.5 h-auto w-full px-2 py-1.5 text-xs whitespace-normal" onClick={() => void placePhoto(p.id)} data-testid="add-to-wall">
                      <PlusIcon aria-hidden="true" />
                      {t("editor.walls.addToWall")}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
