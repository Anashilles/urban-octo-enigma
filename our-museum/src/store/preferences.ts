"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type GraphicsQuality = "auto" | "low" | "medium" | "high";
export type CameraMode = "first" | "third";

/**
 * Per-device viewer preferences (controls, accessibility, graphics, audio).
 * Persisted in localStorage — they describe this device, not the account.
 */
export interface PreferencesState {
  mouseSensitivity: number; // 0.2 – 2.0
  invertY: boolean;
  moveSpeed: number; // 0.5 – 1.6 multiplier
  reducedMotion: boolean;
  highContrast: boolean;
  interactionOutlines: boolean;
  cameraMode: CameraMode;
  graphicsQuality: GraphicsQuality;
  ambientAudio: boolean;
  ambientVolume: number; // 0 – 1
  tutorialSeen: boolean;
  /** Open the photograph automatically when someone starts Look Together. */
  autoFollowShared: boolean;
  set: (patch: Partial<Omit<PreferencesState, "set" | "reset">>) => void;
  reset: () => void;
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

const defaults = () => ({
  mouseSensitivity: 1,
  invertY: false,
  moveSpeed: 1,
  reducedMotion: Boolean(prefersReducedMotion()),
  highContrast: false,
  interactionOutlines: true,
  cameraMode: "first" as CameraMode,
  graphicsQuality: "auto" as GraphicsQuality,
  ambientAudio: false,
  ambientVolume: 0.4,
  tutorialSeen: false,
  autoFollowShared: true,
});

export const usePreferences = create<PreferencesState>()(
  persist(
    (set) => ({
      ...defaults(),
      set: (patch) => set(patch),
      reset: () => set(defaults()),
    }),
    {
      name: "om-preferences",
      version: 1,
      storage: createJSONStorage(() => {
        try {
          return window.localStorage;
        } catch {
          // Private mode / storage disabled: fall back to an in-memory store.
          const mem = new Map<string, string>();
          return {
            getItem: (k: string) => mem.get(k) ?? null,
            setItem: (k: string, v: string) => void mem.set(k, v),
            removeItem: (k: string) => void mem.delete(k),
          };
        }
      }),
      partialize: (state) => {
        const { set, reset, ...rest } = state;
        void set;
        void reset;
        return rest;
      },
    },
  ),
);
