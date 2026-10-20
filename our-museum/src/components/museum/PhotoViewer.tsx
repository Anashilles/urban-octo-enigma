"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  Loader2Icon,
  MinusIcon,
  PlusIcon,
  RotateCcwIcon,
  UsersRoundIcon,
  XIcon,
  EyeIcon,
  ImageOffIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ScenePhoto } from "@/features/museums/scene-types";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { photoImageUrl } from "./photo-urls";

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;

interface Props {
  photos: Map<string, ScenePhoto>;
  sequence: string[];
  photoId: string;
  shared: boolean;
  onNavigate: (photoId: string) => void;
  onClose: () => void;
  /** Extra actions (look together, go to photo, reactions). */
  actions?: ReactNode;
  sharedBanner?: ReactNode;
  /** Following someone else's shared viewing: they choose the photo and the zoom. */
  navigationLocked?: boolean;
  /** The leader's zoom and pan (pan as a fraction of the image size). */
  syncedView?: SharedView | null;
  /** Leader only: reports zoom/pan so followers can mirror it. */
  onViewChange?: (view: SharedView) => void;
  /** Drawn over the photograph (floating reactions). */
  overlay?: ReactNode;
}

export interface SharedView {
  zoom: number;
  panX: number;
  panY: number;
}

export function PhotoViewer(props: Props) {
  const { photos, sequence, photoId, shared, onNavigate, onClose, actions, sharedBanner, navigationLocked = false, syncedView, onViewChange, overlay } = props;
  const { t, dir, formatDate } = useI18n();
  const photo = photos.get(photoId);
  const index = Math.max(0, sequence.indexOf(photoId));
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ startDist: number; startZoom: number; swipeX: number; startX: number; moved: boolean } | null>(null);

  const url = useMemo(() => (photo ? photoImageUrl(photo, "large") : null), [photo]);

  // Reset view state when the photograph changes (adjusting state during render, per React docs).
  const [shownId, setShownId] = useState(photoId);
  if (shownId !== photoId) {
    setShownId(photoId);
    setStatus("loading");
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }

  // Preload neighbours so browsing feels instant (the browser cache reuses them).
  useEffect(() => {
    for (const d of [-1, 1]) {
      const id = sequence[(index + d + sequence.length) % sequence.length];
      const p = id ? photos.get(id) : undefined;
      const u = p ? photoImageUrl(p, "large") : null;
      if (u) {
        const img = new Image();
        img.src = u;
      }
    }
  }, [index, sequence, photos]);

  // Leader: tell followers how the photograph is framed.
  useEffect(() => {
    if (!onViewChange) return;
    const img = imgRef.current;
    const w = img?.clientWidth || 1;
    const h = img?.clientHeight || 1;
    onViewChange({ zoom, panX: offset.x / zoom / w, panY: offset.y / zoom / h });
  }, [zoom, offset, onViewChange]);

  const go = useCallback(
    (delta: number) => {
      if (sequence.length < 2 || navigationLocked) return;
      onNavigate(sequence[(index + delta + sequence.length) % sequence.length]!);
    },
    [index, sequence, onNavigate, navigationLocked],
  );

  const clampOffset = useCallback((o: { x: number; y: number }, z: number) => {
    const el = stageRef.current;
    if (!el || z <= 1) return { x: 0, y: 0 };
    const maxX = (el.clientWidth * (z - 1)) / 2;
    const maxY = (el.clientHeight * (z - 1)) / 2;
    return { x: Math.max(-maxX, Math.min(maxX, o.x)), y: Math.max(-maxY, Math.min(maxY, o.y)) };
  }, []);

  const setZoomClamped = useCallback(
    (z: number) => {
      const nz = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
      setZoom(nz);
      setOffset((o) => clampOffset(o, nz));
    },
    [clampOffset],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (navigationLocked) return;
    const nextKey = dir === "rtl" ? "ArrowLeft" : "ArrowRight";
    const prevKey = dir === "rtl" ? "ArrowRight" : "ArrowLeft";
    if (e.key === nextKey) {
      e.preventDefault();
      go(1);
    } else if (e.key === prevKey) {
      e.preventDefault();
      go(-1);
    } else if (e.key === "+" || e.key === "=") setZoomClamped(zoom * 1.4);
    else if (e.key === "-" || e.key === "_") setZoomClamped(zoom / 1.4);
    else if (e.key === "0") setZoomClamped(1);
  };

  const onWheel = (e: React.WheelEvent) => {
    if (navigationLocked) return;
    setZoomClamped(zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (navigationLocked) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(true);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    gesture.current = {
      startDist: pts.length === 2 ? Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y) : 0,
      startZoom: zoom,
      swipeX: 0,
      startX: e.clientX,
      moved: false,
    };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev || !gesture.current) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    const g = gesture.current;
    if (pts.length === 2 && g.startDist > 0) {
      const d = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
      setZoomClamped(g.startZoom * (d / g.startDist));
      g.moved = true;
      return;
    }
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    if (Math.abs(dx) + Math.abs(dy) > 2) g.moved = true;
    if (zoom > 1) setOffset((o) => clampOffset({ x: o.x + dx, y: o.y + dy }, zoom));
    else g.swipeX = e.clientX - g.startX;
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (g && zoom <= 1 && Math.abs(g.swipeX) > 60 && pointers.current.size === 0) {
      // Swipe: towards the reading direction goes forward.
      const forward = dir === "rtl" ? g.swipeX > 0 : g.swipeX < 0;
      go(forward ? 1 : -1);
    }
    if (pointers.current.size === 0) {
      gesture.current = null;
      setDragging(false);
    }
  };

  if (!photo) return null;
  const following = navigationLocked && syncedView;
  const transform = following
    ? `scale(${syncedView.zoom}) translate(${syncedView.panX * 100}%, ${syncedView.panY * 100}%)`
    : `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`;
  const PrevIcon = dir === "rtl" ? ChevronRightIcon : ChevronLeftIcon;
  const NextIcon = dir === "rtl" ? ChevronLeftIcon : ChevronRightIcon;

  return (
    <DialogPrimitive.Root open onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink/92 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed inset-0 z-50 flex flex-col text-ivory outline-none"
          onKeyDown={onKeyDown}
          aria-describedby="viewer-caption"
          data-testid="photo-viewer"
        >
          <header className="flex items-center gap-3 px-4 pt-[max(env(safe-area-inset-top),1rem)] pb-2 sm:px-6">
            <Badge variant="glass" data-testid="viewer-mode">
              {shared ? <UsersRoundIcon aria-hidden="true" /> : <EyeIcon aria-hidden="true" />}
              {shared ? t("museum.viewer.together") : t("museum.viewer.private")}
            </Badge>
            <span className="text-sm text-ivory/60" aria-live="polite">
              {t("museum.viewer.counter", { current: index + 1, total: sequence.length })}
            </span>
            <div className="ms-auto flex items-center gap-1.5">
              {!navigationLocked && (
                <>
                  <Button variant="glass" size="icon-sm" onClick={() => setZoomClamped(zoom / 1.4)} aria-label={t("museum.viewer.zoomOut")} disabled={zoom <= MIN_ZOOM}>
                    <MinusIcon />
                  </Button>
                  <Button variant="glass" size="icon-sm" onClick={() => setZoomClamped(zoom * 1.4)} aria-label={t("museum.viewer.zoomIn")} disabled={zoom >= MAX_ZOOM}>
                    <PlusIcon />
                  </Button>
                  <Button variant="glass" size="icon-sm" onClick={() => setZoomClamped(1)} aria-label={t("museum.viewer.resetZoom")} disabled={zoom === 1}>
                    <RotateCcwIcon />
                  </Button>
                </>
              )}
              <DialogPrimitive.Close asChild>
                <Button variant="glass" size="icon" aria-label={t("museum.viewer.close")} data-testid="viewer-close">
                  <XIcon />
                </Button>
              </DialogPrimitive.Close>
            </div>
          </header>
          {sharedBanner}

          <div className="relative flex min-h-0 flex-1 items-center justify-center px-3 sm:px-20">
            {sequence.length > 1 && !navigationLocked && (
              <Button
                variant="glass"
                size="icon-lg"
                className="absolute start-3 top-1/2 z-10 -translate-y-1/2 sm:start-5"
                onClick={() => go(-1)}
                aria-label={t("museum.viewer.previous")}
                data-testid="viewer-prev"
              >
                <PrevIcon />
              </Button>
            )}
            <div
              ref={stageRef}
              className="no-touch-action relative flex size-full items-center justify-center overflow-hidden select-none"
              onWheel={onWheel}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onDoubleClick={() => !navigationLocked && setZoomClamped(zoom > 1 ? 1 : 2.2)}
              style={{ cursor: navigationLocked ? "default" : zoom > 1 ? "grab" : "zoom-in" }}
            >
              {status === "loading" && (
                <div className="absolute inset-0 grid place-items-center" role="status">
                  <span className="flex items-center gap-2 text-sm text-ivory/70">
                    <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
                    {t("museum.viewer.loading")}
                  </span>
                </div>
              )}
              {status === "error" || !url ? (
                <div className="grid place-items-center gap-3 text-center text-ivory/75" role="alert">
                  <ImageOffIcon className="size-8" aria-hidden="true" />
                  {t("museum.viewer.error")}
                </div>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived URLs; next/image optimisation would re-fetch them
                <img
                  ref={imgRef}
                  key={url}
                  src={url}
                  alt={photo.title || t("museum.prompt.untitled")}
                  draggable={false}
                  onLoad={() => setStatus("ready")}
                  onError={() => setStatus("error")}
                  className={cn(
                    "max-h-full max-w-full object-contain shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)] transition-opacity duration-300",
                    status === "ready" ? "opacity-100" : "opacity-0",
                  )}
                  style={{ transform, transition: dragging ? "none" : `transform ${following ? 220 : 150}ms ease-out, opacity 300ms` }}
                  data-testid="viewer-image"
                />
              )}
              {overlay}
            </div>
            {sequence.length > 1 && !navigationLocked && (
              <Button
                variant="glass"
                size="icon-lg"
                className="absolute end-3 top-1/2 z-10 -translate-y-1/2 sm:end-5"
                onClick={() => go(1)}
                aria-label={t("museum.viewer.next")}
                data-testid="viewer-next"
              >
                <NextIcon />
              </Button>
            )}
          </div>

          <footer className="mx-auto grid w-full max-w-3xl gap-2 px-5 pt-3 pb-[max(env(safe-area-inset-bottom),1.25rem)] text-center">
            <DialogPrimitive.Title className="font-display text-2xl leading-tight sm:text-3xl" data-testid="viewer-title">
              {photo.title || t("common.untitled")}
            </DialogPrimitive.Title>
            <p id="viewer-caption" className="text-sm leading-relaxed text-ivory/75">
              {photo.caption}
              {photo.takenAt && (
                <span className="block text-ivory/55">
                  {t("museum.viewer.takenOn", { date: formatDate(photo.takenAt, { dateStyle: "long" }) })}
                </span>
              )}
            </p>
            {actions && <div className="mt-1 flex flex-wrap items-center justify-center gap-2">{actions}</div>}
            <p className="hidden text-xs text-ivory/40 sm:block">{t("museum.viewer.keyboardHint")}</p>
          </footer>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
