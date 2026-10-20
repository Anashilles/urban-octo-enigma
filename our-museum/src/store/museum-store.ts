"use client";

import { useEffect } from "react";
import { create } from "zustand";
import type { SceneData } from "@/features/museums/scene-types";
import { setInputEnabled } from "@/three/controls/input";
import type { PlayerPose } from "@/three/runtime";

export type Panel = "collections" | "people" | "settings" | "help" | "timeline" | "tours" | "invite" | "room" | null;

export interface ViewerState {
  photoId: string;
  frameId: string | null;
  /** Ordered photo ids the viewer navigates through. */
  sequence: string[];
  shared: boolean;
}

/** The guided tour this visitor is taking: alone, leading everyone, or following a guide. */
export interface ActiveTour {
  tourId: string;
  index: number;
  mode: "solo" | "leading" | "following";
}

export interface PlacementState {
  photoId: string;
  /** Size multiplier chosen with the HUD buttons. */
  scale?: number;
  /** Live preview computed by the scene. */
  preview: { roomId: string; wallId: string; wallKey: string; u: number; v: number; width: number; height: number; valid: boolean; problem?: string } | null;
}

interface MuseumUiState {
  scene: SceneData | null;
  focusedFrameId: string | null;
  viewer: ViewerState | null;
  panel: Panel;
  /** Number of open modal surfaces that should block movement input. */
  inputBlockers: number;
  placement: PlacementState | null;
  guideFrameId: string | null;
  returnPose: Pick<PlayerPose, "x" | "z" | "yaw" | "pitch"> | null;
  fadeKey: number;
  currentRoomId: string | null;
  tour: ActiveTour | null;
  setScene: (scene: SceneData) => void;
  patchScene: (fn: (scene: SceneData) => SceneData) => void;
  setFocused: (id: string | null) => void;
  openViewer: (v: ViewerState) => void;
  closeViewer: () => void;
  setPanel: (panel: Panel) => void;
  /** Blocks movement while a modal surface is open; returns the release function. */
  acquireInputBlock: () => () => void;
  setPlacement: (p: PlacementState | null) => void;
  setGuide: (frameId: string | null) => void;
  setReturnPose: (pose: MuseumUiState["returnPose"]) => void;
  flashFade: () => void;
  setCurrentRoom: (id: string | null) => void;
  setTour: (tour: ActiveTour | null) => void;
}

function syncInput(s: Pick<MuseumUiState, "viewer" | "inputBlockers">) {
  setInputEnabled(!s.viewer && s.inputBlockers === 0);
}

export const useMuseumStore = create<MuseumUiState>()((set, get) => ({
  scene: null,
  focusedFrameId: null,
  viewer: null,
  panel: null,
  inputBlockers: 0,
  placement: null,
  guideFrameId: null,
  returnPose: null,
  fadeKey: 0,
  currentRoomId: null,
  tour: null,
  setScene: (scene) => set({ scene }),
  patchScene: (fn) => {
    const s = get().scene;
    if (s) set({ scene: fn(s) });
  },
  setFocused: (id) => {
    if (get().focusedFrameId !== id) set({ focusedFrameId: id });
  },
  openViewer: (viewer) => {
    set({ viewer });
    syncInput({ viewer, inputBlockers: get().inputBlockers });
    if (document.pointerLockElement) document.exitPointerLock();
  },
  closeViewer: () => {
    set({ viewer: null });
    syncInput({ viewer: null, inputBlockers: get().inputBlockers });
  },
  setPanel: (panel) => set({ panel }),
  acquireInputBlock: () => {
    set((s) => ({ inputBlockers: s.inputBlockers + 1 }));
    syncInput(get());
    if (document.pointerLockElement) document.exitPointerLock();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      set((s) => ({ inputBlockers: Math.max(0, s.inputBlockers - 1) }));
      syncInput(get());
    };
  },
  setPlacement: (placement) => set({ placement }),
  setGuide: (guideFrameId) => set({ guideFrameId }),
  setReturnPose: (returnPose) => set({ returnPose }),
  flashFade: () => set((s) => ({ fadeKey: s.fadeKey + 1 })),
  setTour: (tour) => set({ tour }),
  setCurrentRoom: (currentRoomId) => {
    if (get().currentRoomId !== currentRoomId) set({ currentRoomId });
  },
}));

/** Blocks 3D movement input while `active` (dialogs, upload forms…). */
export function useInputBlock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    return useMuseumStore.getState().acquireInputBlock();
  }, [active]);
}
