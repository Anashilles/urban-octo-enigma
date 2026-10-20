"use client";

import { useEffect, useMemo } from "react";
import { buildDemoScene } from "@/features/museums/demo-scene";
import { useT } from "@/i18n/client";
import { useMuseumStore } from "@/store/museum-store";
import { MuseumCanvas } from "./MuseumCanvas";
import { MuseumWorld } from "./MuseumWorld";

/**
 * Lightweight interactive preview for the landing page: the sample museum,
 * drag to look around. Loaded on demand only.
 */
export default function PreviewCanvas() {
  const t = useT();
  const scene = useMemo(() => {
    const s = buildDemoScene("warm-romantic", t, 18);
    // Start inside the main hall, looking at the far wall.
    return { ...s, spawn: { x: 0, z: -5.2, yaw: 0 } };
  }, [t]);
  useEffect(() => {
    useMuseumStore.getState().setScene(scene);
  }, [scene]);
  return (
    <MuseumCanvas quality="medium" className="absolute inset-0 size-full touch-none" fov={62}>
      <MuseumWorld scene={scene} quality="medium" onInteractFrame={() => undefined} allowPointerLock={false} keyboard={false} />
    </MuseumCanvas>
  );
}
