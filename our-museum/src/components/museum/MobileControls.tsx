"use client";

import { useRef, useState } from "react";
import { EyeIcon, ZapIcon } from "lucide-react";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { input } from "@/three/controls/input";

const RADIUS = 52;

/** Touch joystick + action buttons. DOM overlays, so touches never leak into the 3D view. */
export function MobileControls({ canInteract, onInteract }: { canInteract: boolean; onInteract: () => void }) {
  const t = useT();
  const base = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [sprint, setSprint] = useState(false);
  const active = useRef<number | null>(null);

  const update = (clientX: number, clientY: number) => {
    const el = base.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let dx = clientX - (rect.left + rect.width / 2);
    let dy = clientY - (rect.top + rect.height / 2);
    const d = Math.hypot(dx, dy);
    if (d > RADIUS) {
      dx = (dx / d) * RADIUS;
      dy = (dy / d) * RADIUS;
    }
    setKnob({ x: dx, y: dy });
    // Small dead zone avoids drift from resting thumbs.
    const nx = dx / RADIUS;
    const ny = -dy / RADIUS;
    input.joyX = Math.abs(nx) < 0.12 ? 0 : nx;
    input.joyY = Math.abs(ny) < 0.12 ? 0 : ny;
  };
  const release = () => {
    active.current = null;
    setKnob({ x: 0, y: 0 });
    input.joyX = 0;
    input.joyY = 0;
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end justify-between p-5 pb-[max(env(safe-area-inset-bottom),1.5rem)]" data-testid="mobile-controls" dir="ltr">
      <div
        ref={base}
        role="application"
        aria-label={t("museum.mobile.joystick")}
        className="no-touch-action pointer-events-auto relative size-32 rounded-full border border-white/15 bg-ink/35 backdrop-blur-sm"
        onPointerDown={(e) => {
          active.current = e.pointerId;
          e.currentTarget.setPointerCapture(e.pointerId);
          update(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (active.current === e.pointerId) update(e.clientX, e.clientY);
        }}
        onPointerUp={release}
        onPointerCancel={release}
        data-testid="joystick"
      >
        <div
          className="absolute top-1/2 left-1/2 size-14 rounded-full border border-white/30 bg-ivory/80 shadow-lg"
          style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }}
        />
      </div>
      <div className="pointer-events-auto flex flex-col items-center gap-3">
        <button
          type="button"
          aria-pressed={sprint}
          aria-label={t("museum.mobile.sprint")}
          onClick={() => {
            input.sprintToggle = !sprint;
            setSprint(!sprint);
          }}
          className={cn(
            "grid size-12 place-items-center rounded-full border border-white/15 bg-ink/65 text-ivory backdrop-blur-sm",
            sprint && "border-gold bg-gold/30",
          )}
        >
          <ZapIcon className="size-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={t("museum.mobile.interact")}
          disabled={!canInteract}
          onClick={onInteract}
          className="grid size-16 place-items-center rounded-full border border-gold/60 bg-ink/70 text-gold backdrop-blur-sm transition disabled:opacity-35"
          data-testid="mobile-interact"
        >
          <EyeIcon className="size-6" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
