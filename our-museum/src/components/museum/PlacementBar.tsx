"use client";

import { useEffect } from "react";
import { CheckIcon, MinusIcon, PlusIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SceneData } from "@/features/museums/scene-types";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { photoImageUrl } from "./photo-urls";
import { useMuseumStore } from "@/store/museum-store";
import { isTypingTarget } from "@/three/controls/input";

const MIN_SCALE = 0.5;
const MAX_SCALE = 1.8;
const STEP = 0.15;

const AIM_PROBLEMS = new Set(["aim_wall", "too_far"]);

/** HUD for "place on wall while exploring": status, size and confirm/cancel. */
export function PlacementBar({ scene, busy }: { scene: SceneData; busy: boolean }) {
  const t = useT();
  const placement = useMuseumStore((s) => s.placement);
  const setPlacement = useMuseumStore((s) => s.setPlacement);
  const photo = placement ? scene.photos.find((p) => p.id === placement.photoId) : null;

  useEffect(() => {
    if (!placement) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const s = useMuseumStore.getState();
      if (!s.placement || s.viewer) return;
      const scale = s.placement.scale ?? 1;
      if (e.code === "Escape") setPlacement(null);
      else if (e.code === "BracketLeft" || e.code === "Minus") setPlacement({ ...s.placement, scale: Math.max(MIN_SCALE, scale - STEP) });
      else if (e.code === "BracketRight" || e.code === "Equal") setPlacement({ ...s.placement, scale: Math.min(MAX_SCALE, scale + STEP) });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [placement, setPlacement]);

  if (!placement || !photo) return null;
  const scale = placement.scale ?? 1;
  const thumb = photoImageUrl(photo, "thumb");
  const preview = placement.preview;
  const problem = preview?.problem;
  const valid = Boolean(preview?.valid);
  const message = !preview
    ? t("museum.placement.aim_wall")
    : valid
      ? t("museum.placement.valid")
      : problem && AIM_PROBLEMS.has(problem)
        ? t(`museum.placement.${problem as "aim_wall" | "too_far"}`)
        : t(`editor.walls.problems.${(problem ?? "out_of_bounds") as "out_of_bounds"}`);

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-24 z-30 flex justify-center px-3">
      <div
        className="glass-dark pointer-events-auto flex w-full max-w-xl flex-col gap-3 rounded-2xl border border-white/10 p-3 text-ivory shadow-xl sm:flex-row sm:items-center"
        role="region"
        aria-label={t("museum.placement.title", { title: photo.title || t("museum.prompt.untitled") })}
        data-testid="placement-bar"
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="size-11 shrink-0 overflow-hidden rounded-md border border-white/15" style={{ background: photo.dominantColor }} aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element -- signed short-lived URL */}
            {thumb && <img src={thumb} alt="" className="size-full object-cover" />}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{t("museum.placement.title", { title: photo.title || t("museum.prompt.untitled") })}</p>
            <p className={cn("text-xs", valid ? "text-[#9fe0ad]" : "text-[#f2a1a1]")} role="status" aria-live="polite" data-testid="placement-status" data-valid={valid}>
              {message}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            size="icon"
            variant="glass"
            aria-label={t("museum.placement.smaller")}
            disabled={scale <= MIN_SCALE + 1e-6}
            onClick={() => setPlacement({ ...placement, scale: Math.max(MIN_SCALE, scale - STEP) })}
          >
            <MinusIcon />
          </Button>
          <Button
            size="icon"
            variant="glass"
            aria-label={t("museum.placement.larger")}
            disabled={scale >= MAX_SCALE - 1e-6}
            onClick={() => setPlacement({ ...placement, scale: Math.min(MAX_SCALE, scale + STEP) })}
          >
            <PlusIcon />
          </Button>
          <Button variant="glass" onClick={() => setPlacement(null)} data-testid="placement-cancel">
            <XIcon aria-hidden="true" />
            {t("museum.placement.cancel")}
          </Button>
          <Button
            variant="gold"
            disabled={!valid || busy}
            onClick={() => window.dispatchEvent(new Event("om:placement-confirm"))}
            data-testid="placement-confirm"
          >
            <CheckIcon aria-hidden="true" />
            {t("museum.placement.hangHere")}
          </Button>
        </div>
      </div>
    </div>
  );
}
