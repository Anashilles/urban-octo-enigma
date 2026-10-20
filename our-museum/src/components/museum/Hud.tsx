"use client";

import Link from "next/link";
import { useSyncExternalStore, type ReactNode } from "react";
import {
  ArrowLeftIcon,
  CircleHelpIcon,
  ImagesIcon,
  MaximizeIcon,
  MinimizeIcon,
  SettingsIcon,
  Undo2Icon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/controls";
import type { SceneData } from "@/features/museums/scene-types";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { useMuseumStore, type Panel } from "@/store/museum-store";

function subscribeLock(cb: () => void) {
  document.addEventListener("pointerlockchange", cb);
  return () => document.removeEventListener("pointerlockchange", cb);
}

export function usePointerLocked() {
  return useSyncExternalStore(
    subscribeLock,
    () => Boolean(document.pointerLockElement),
    () => false,
  );
}

function subscribeFullscreen(cb: () => void) {
  document.addEventListener("fullscreenchange", cb);
  return () => document.removeEventListener("fullscreenchange", cb);
}

export function toggleFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  else void document.documentElement.requestFullscreen?.().catch(() => undefined);
}

function subscribeCoarse(cb: () => void) {
  const mq = window.matchMedia("(pointer: coarse)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

export function useIsCoarse() {
  return useSyncExternalStore(
    subscribeCoarse,
    () => window.matchMedia("(pointer: coarse)").matches,
    () => false,
  );
}

export function HudIconButton({
  label,
  onClick,
  children,
  active,
  testId,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  active?: boolean;
  testId?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="glass"
          size="icon"
          onClick={onClick}
          aria-label={label}
          aria-pressed={active}
          data-testid={testId}
          className={cn(active && "bg-white/15 ring-1 ring-gold/60")}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

interface HudProps {
  scene: SceneData;
  exitHref: string;
  onOpenFrame: (frameId: string) => void;
  onReturn: () => void;
  /** Extra toolbar buttons (people, invite, edit, voice…). */
  toolbar?: ReactNode;
  /** Small status chips next to the room name (presence, connection). */
  status?: ReactNode;
  badge?: ReactNode;
}

export function Hud({ scene, exitHref, onOpenFrame, onReturn, toolbar, status, badge }: HudProps) {
  const { t, dir } = useI18n();
  const locked = usePointerLocked();
  const coarse = useIsCoarse();
  const fullscreen = useSyncExternalStore(subscribeFullscreen, () => Boolean(document.fullscreenElement), () => false);
  const focusedFrameId = useMuseumStore((s) => s.focusedFrameId);
  const currentRoomId = useMuseumStore((s) => s.currentRoomId);
  const panel = useMuseumStore((s) => s.panel);
  const setPanel = useMuseumStore((s) => s.setPanel);
  const returnPose = useMuseumStore((s) => s.returnPose);
  const viewerOpen = useMuseumStore((s) => Boolean(s.viewer));
  const fadeKey = useMuseumStore((s) => s.fadeKey);
  const placing = useMuseumStore((s) => Boolean(s.placement));

  const room = scene.rooms.find((r) => r.id === currentRoomId);
  const focusedFrame = focusedFrameId && !placing ? scene.frames.find((f) => f.id === focusedFrameId) : null;
  const focusedPhoto = focusedFrame ? scene.photos.find((p) => p.id === focusedFrame.photoId) : null;
  const togglePanel = (p: Panel) => setPanel(panel === p ? null : p);
  const BackIcon = ArrowLeftIcon;

  return (
    <>
      {/* Top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start gap-3 p-3 pt-[max(env(safe-area-inset-top),0.75rem)] sm:p-4">
        <div className="pointer-events-auto flex min-w-0 items-center gap-2">
          <Button asChild variant="glass" size="icon" aria-label={t("museum.exit")} data-testid="exit-museum">
            <Link href={exitHref}>
              <BackIcon className={cn(dir === "rtl" && "rotate-180")} />
            </Link>
          </Button>
          <div className="glass-dark min-w-0 rounded-2xl border border-white/10 px-4 py-2 text-ivory" data-hud-panel>
            <div className="flex items-center gap-2">
              <p className="truncate font-display text-lg leading-tight" data-testid="museum-name">
                {scene.museum.name}
              </p>
              {badge}
            </div>
            <p className="truncate text-xs text-ivory/65" aria-live="polite" data-testid="current-room">
              {room?.name ?? t("museum.betweenRooms")}
            </p>
          </div>
          {status}
        </div>
        <div className="pointer-events-auto ms-auto flex flex-wrap items-center justify-end gap-1.5" data-hud-panel>
          <HudIconButton label={t("museum.hud.photos")} onClick={() => togglePanel("collections")} active={panel === "collections"} testId="hud-photos">
            <ImagesIcon />
          </HudIconButton>
          {toolbar}
          <HudIconButton label={t("museum.hud.settings")} onClick={() => togglePanel("settings")} active={panel === "settings"} testId="hud-settings">
            <SettingsIcon />
          </HudIconButton>
          <HudIconButton label={t("museum.hud.help")} onClick={() => togglePanel("help")} active={panel === "help"} testId="hud-help">
            <CircleHelpIcon />
          </HudIconButton>
          <HudIconButton
            label={fullscreen ? t("museum.hud.exitFullscreen") : t("museum.hud.fullscreen")}
            onClick={toggleFullscreen}
            testId="hud-fullscreen"
          >
            {fullscreen ? <MinimizeIcon /> : <MaximizeIcon />}
          </HudIconButton>
        </div>
      </div>

      {/* Crosshair while the mouse is captured, and always while aiming a placement */}
      {(locked || placing) && !viewerOpen && (
        <div className="pointer-events-none absolute top-1/2 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2" aria-hidden="true">
          <div className={cn("size-1.5 rounded-full bg-ivory/90 shadow-[0_0_0_2px_rgba(23,25,29,0.35)] transition-transform", focusedFrame && "scale-150 bg-gold")} />
        </div>
      )}

      {/* Bottom: interaction prompt and hints */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-2 p-4 pb-[max(env(safe-area-inset-bottom),1rem)]">
        {returnPose && (
          <Button variant="glass" size="sm" className="pointer-events-auto" onClick={onReturn} data-testid="return-position">
            <Undo2Icon aria-hidden="true" />
            {t("museum.hud.returnToPosition")}
          </Button>
        )}
        {focusedFrame && !viewerOpen && (
          <button
            type="button"
            onClick={() => onOpenFrame(focusedFrame.id)}
            className="glass-dark pointer-events-auto flex items-center gap-3 rounded-full border border-white/10 py-2 ps-2 pe-5 text-sm text-ivory shadow-lg transition hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-gold"
            data-testid="interact-prompt"
          >
            {!coarse && (
              <kbd className="grid size-7 place-items-center rounded-full border border-gold/60 font-sans text-xs font-semibold text-gold">
                {t("museum.prompt.pressE")}
              </kbd>
            )}
            <span className="max-w-[60vw] truncate">
              {coarse ? t("museum.prompt.tap") + " · " : ""}
              {t("museum.prompt.view", { title: focusedPhoto?.title || t("museum.prompt.untitled") })}
            </span>
          </button>
        )}
        {!coarse && !locked && !viewerOpen && !focusedFrame && !placing && (
          <p className="glass-dark rounded-full px-4 py-1.5 text-xs text-ivory/75" data-testid="click-to-look">
            {t("museum.clickToLook")}
          </p>
        )}
      </div>

      {/* Fade used when teleporting between rooms */}
      {fadeKey > 0 && <div key={fadeKey} className="pointer-events-none absolute inset-0 z-30 animate-[om-fade_650ms_ease-out_forwards] bg-ink" aria-hidden="true" />}
      <style>{`@keyframes om-fade { 0% { opacity: 1 } 100% { opacity: 0 } }`}</style>
    </>
  );
}
