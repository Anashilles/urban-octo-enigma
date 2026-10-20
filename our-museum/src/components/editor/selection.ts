"use client";

import { create } from "zustand";
import type { WallKey } from "@/features/rooms/geometry";

/** Editor-wide selection shared between the photo library and the wall editor. */
interface Selection {
  photoId: string | null;
  frameId: string | null;
  roomId: string | null;
  wallKey: WallKey;
  set: (p: Partial<Omit<Selection, "set">>) => void;
}

export const useEditorSelection = create<Selection>()((set) => ({
  photoId: null,
  frameId: null,
  roomId: null,
  wallKey: "north",
  set: (p) => set(p),
}));
