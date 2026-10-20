"use client";

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { useSceneRefresher } from "@/components/live/use-scene-refresher";
import type { SceneData } from "@/features/museums/scene-types";
import { useT } from "@/i18n/client";
import { api, ApiError, errorKey } from "@/lib/api/client";
import { useMuseumStore } from "@/store/museum-store";
import { trackSave } from "./save-status";

interface EditorContextValue {
  museumId: string;
  scene: SceneData;
  refresh: () => Promise<void>;
  /** Persists a change with save tracking, then refreshes the scene. */
  mutate: <T = unknown>(path: string, init: Omit<RequestInit, "body"> & { body?: unknown }, opts?: { refresh?: boolean }) => Promise<T>;
  errorText: (e: unknown) => string;
  maxUploadBytes: number;
}

const EditorContext = createContext<EditorContextValue | null>(null);

export function EditorProvider({ museumId, maxUploadBytes, children }: { museumId: string; maxUploadBytes: number; children: ReactNode }) {
  const t = useT();
  const scene = useMuseumStore((s) => s.scene);
  const refresh = useSceneRefresher(museumId);
  const errorText = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError && e.code === "PLACEMENT_INVALID") {
        const problem = (e.details as { problem?: string } | undefined)?.problem;
        if (problem) return t(`editor.walls.problems.${problem}` as "editor.walls.problems.out_of_bounds");
      }
      if (e instanceof ApiError && e.code === "CONFLICT" && (e.details as { reason?: string } | undefined)?.reason === "stale_frame") return t("editor.walls.staleFrame");
      if (e instanceof ApiError && (e.code === "CONFLICT" || e.code === "VALIDATION_FAILED") && e.message) return e.message;
      return t(errorKey(e));
    },
    [t],
  );
  const mutate = useCallback(
    async <T,>(path: string, init: Omit<RequestInit, "body"> & { body?: unknown }, opts: { refresh?: boolean } = {}) => {
      const result = await trackSave(() => api<T>(path, init), errorText);
      if (opts.refresh !== false) await refresh();
      return result;
    },
    [errorText, refresh],
  );
  const value = useMemo(() => (scene ? { museumId, scene, refresh, mutate, errorText, maxUploadBytes } : null), [museumId, scene, refresh, mutate, errorText, maxUploadBytes]);
  if (!value) return null;
  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
}

export function useEditor() {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error("useEditor must be used inside <EditorProvider>");
  return ctx;
}
