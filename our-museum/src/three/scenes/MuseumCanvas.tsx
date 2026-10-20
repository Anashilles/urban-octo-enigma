"use client";

import { useState, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import { PerformanceMonitor } from "@react-three/drei";
import * as THREE from "three";
import { usePreferences } from "@/store/preferences";
import type { Quality } from "@/three/rooms/Architecture";

/** True when the browser can create a WebGL context. */
export function detectWebGL(): boolean {
  if (typeof window === "undefined") return true;
  if (new URLSearchParams(window.location.search).get("webgl") === "0") return false;
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

function isCoarsePointer() {
  return typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
}

/** Resolves the effective quality from the preference and the device. */
export function useEffectiveQuality(): [Quality, (q: Quality) => void] {
  const pref = usePreferences((s) => s.graphicsQuality);
  // Client-only component: the device can be inspected during the first render.
  const [auto, setAuto] = useState<Quality>(() => {
    if (typeof window === "undefined") return "high";
    const mobile = isCoarsePointer() || window.innerWidth < 760;
    const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
    return mobile || memory <= 4 ? "medium" : "high";
  });
  return [pref === "auto" ? auto : pref, setAuto];
}

export function MuseumCanvas({
  children,
  quality,
  onQualityDrop,
  className,
  fov,
}: {
  children: ReactNode;
  quality: Quality;
  onQualityDrop?: () => void;
  className?: string;
  fov?: number;
}) {
  const maxDpr = quality === "high" ? 2 : quality === "medium" ? 1.5 : 1;
  const [dpr, setDpr] = useState(Math.min(maxDpr, typeof window !== "undefined" ? window.devicePixelRatio : 1));
  return (
    <Canvas
      className={className}
      dpr={dpr}
      camera={{ fov: fov ?? (isCoarsePointer() ? 74 : 70), near: 0.05, far: 140, position: [0, 1.6, 0] }}
      gl={{ antialias: quality !== "low", powerPreference: "high-performance", alpha: false, stencil: false }}
      onCreated={({ gl }) => {
        gl.outputColorSpace = THREE.SRGBColorSpace;
      }}
      tabIndex={0}
      aria-label="3D museum"
      data-testid="museum-canvas"
    >
      <PerformanceMonitor
        onDecline={() => {
          setDpr((d) => Math.max(1, d - 0.25));
          onQualityDrop?.();
        }}
        onIncline={() => setDpr((d) => Math.min(maxDpr, d + 0.25))}
      />
      {children}
    </Canvas>
  );
}
