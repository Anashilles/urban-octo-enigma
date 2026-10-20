"use client";

import { useCallback, useRef } from "react";
import type { SceneData } from "@/features/museums/scene-types";
import { api } from "@/lib/api/client";
import { useMuseumStore } from "@/store/museum-store";

/** Fetches a fresh scene (new signed URLs, latest layout) and swaps it in place. */
export function useSceneRefresher(museumId: string) {
  const inflight = useRef<Promise<void> | null>(null);
  return useCallback(() => {
    if (inflight.current) return inflight.current;
    inflight.current = api<SceneData>(`/api/museums/${museumId}/scene`)
      .then((scene) => useMuseumStore.getState().setScene(scene))
      .catch(() => undefined)
      .finally(() => {
        inflight.current = null;
      });
    return inflight.current;
  }, [museumId]);
}
