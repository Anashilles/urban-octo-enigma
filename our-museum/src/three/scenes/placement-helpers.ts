import type { FramePlacement } from "@/features/photo-placement/placement";
import type { SceneFrame } from "@/features/museums/scene-types";

export function toPlacementList(frames: SceneFrame[]): Array<FramePlacement & { id: string }> {
  return frames.map((f) => ({ id: f.id, u: f.u, v: f.v, width: f.width, height: f.height, rotation: f.rotation, style: f.style, options: f.options }));
}
