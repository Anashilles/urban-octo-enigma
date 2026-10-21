"use client";

import { useRef } from "react";

/** Moves keyboard focus to the 3D scene so movement keys work immediately. */
export function focusScene() {
  document.querySelector<HTMLElement>("[data-scene-canvas]")?.focus({ preventScroll: true });
}

/**
 * For HUD panels. Actions that send the visitor back into the scene move focus
 * there at once — keys pressed while the panel animates out would otherwise be
 * ignored as panel input — and stop the panel from handing focus back to the
 * HUD button once it has closed.
 */
export function usePanelExitFocus() {
  const handled = useRef(false);
  return {
    /** The action continues in the 3D scene (go to, locate, place, tours). */
    toScene: () => {
      handled.current = true;
      focusScene();
    },
    /** Whatever opens next manages focus itself (e.g. the photo viewer). */
    elsewhere: () => {
      handled.current = true;
    },
    onCloseAutoFocus: (e: Event) => {
      if (!handled.current) return;
      handled.current = false;
      e.preventDefault();
    },
  };
}
