"use client";

import { useEffect, useRef, useState } from "react";
import { PauseIcon, PlayIcon } from "lucide-react";
import type { SceneNarration } from "@/features/museums/scene-types";
import { useI18n } from "@/i18n/client";
import { usePreferences } from "@/store/preferences";

export function formatClock(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * The recorded narration for a tour stop. Mount it with a key per stop: it
 * starts on arrival (unless turned off in settings, or the browser blocks
 * autoplay) and stops when the visitor moves on. The URL is fixed at mount so
 * a scene refresh (which signs new URLs) doesn't restart the recording.
 */
export function StopNarration({ narration }: { narration: SceneNarration }) {
  const { t } = useI18n();
  const ref = useRef<HTMLAudioElement>(null);
  const [src] = useState(narration.url);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const total = narration.durationMs;

  useEffect(() => {
    if (!usePreferences.getState().autoPlayNarration) return;
    // Rejected when the browser wants a gesture first; the play button remains.
    ref.current?.play().catch(() => undefined);
  }, []);

  const toggle = () => {
    const el = ref.current;
    if (!el) return;
    if (el.paused) void el.play().catch(() => undefined);
    else el.pause();
  };

  const progress = total ? Math.min(1, position / total) : 0;
  return (
    <div className="flex items-center gap-3 rounded-xl bg-white/5 px-2 py-1.5" data-testid="tour-narration" data-state={playing ? "playing" : "paused"}>
      <audio
        ref={ref}
        src={src}
        preload="auto"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setPosition(total);
        }}
        onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime * 1000)}
      />
      <button
        type="button"
        onClick={toggle}
        className="grid size-8 shrink-0 place-items-center rounded-full bg-gold text-ink transition hover:bg-gold/90 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        aria-label={playing ? t("museum.tours.narrationPause") : t("museum.tours.narrationPlay")}
        data-testid="tour-narration-toggle"
      >
        {playing ? <PauseIcon className="size-4" aria-hidden="true" /> : <PlayIcon className="size-4 translate-x-px rtl:-scale-x-100" aria-hidden="true" />}
      </button>
      <div
        className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-white/15"
        role="progressbar"
        aria-label={t("museum.tours.narration")}
        aria-valuemin={0}
        aria-valuemax={Math.round(total / 1000)}
        aria-valuenow={Math.round(position / 1000)}
        aria-valuetext={`${formatClock(position)} / ${formatClock(total)}`}
      >
        <div className="h-full origin-left bg-gold transition-[width] rtl:origin-right" style={{ width: `${progress * 100}%` }} />
      </div>
      <span className="shrink-0 text-xs text-ivory/70 tabular-nums" dir="ltr">
        {formatClock(position)} / {formatClock(total)}
      </span>
    </div>
  );
}
