"use client";

import { useEffect, useRef } from "react";
import { AmbientSoundscape } from "@/features/audio/ambient";
import { usePreferences } from "@/store/preferences";

/** Plays the ambient soundscape when enabled in settings (off by default). */
export function AmbientAudio() {
  const enabled = usePreferences((s) => s.ambientAudio);
  const volume = usePreferences((s) => s.ambientVolume);
  const scape = useRef<AmbientSoundscape | null>(null);

  useEffect(() => {
    if (!enabled) {
      scape.current?.stop();
      return;
    }
    scape.current ??= new AmbientSoundscape();
    const s = scape.current;
    s.start(usePreferences.getState().ambientVolume);
    // If the browser blocked playback (no gesture yet), start on the next interaction.
    const unlock = () => s.resume();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [enabled]);

  useEffect(() => {
    scape.current?.setVolume(volume);
  }, [volume]);

  useEffect(
    () => () => {
      scape.current?.dispose();
      scape.current = null;
    },
    [],
  );
  return null;
}
