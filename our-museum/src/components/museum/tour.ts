"use client";

import type { SceneData, SceneTour } from "@/features/museums/scene-types";
import { useMuseumStore, type ActiveTour } from "@/store/museum-store";
import { goToFrame } from "./navigation";

/** Stops whose photograph still hangs in the museum. */
export function tourStops(scene: SceneData, tour: SceneTour) {
  return tour.stops.filter((s) => scene.frames.some((f) => f.id === s.frameId));
}

/** Walks the visitor to a stop of the active tour (and records it in the store). */
export function goToTourStop(scene: SceneData, tour: ActiveTour, opts: { side?: number } = {}) {
  const t = scene.tours.find((x) => x.id === tour.tourId);
  if (!t) return false;
  const stops = tourStops(scene, t);
  const stop = stops[Math.max(0, Math.min(stops.length - 1, tour.index))];
  if (!stop) return false;
  useMuseumStore.getState().setTour(tour);
  return goToFrame(scene, stop.frameId, { side: opts.side, remember: tour.index === 0 });
}

/** A stable sideways spot for a follower, so a group spreads out in front of a photo. */
export function followerSide(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const slot = (Math.abs(h) % 5) - 2;
  return slot === 0 ? 0.9 : slot * 0.8;
}
