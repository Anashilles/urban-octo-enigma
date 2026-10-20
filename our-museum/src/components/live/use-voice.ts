"use client";

import { useEffect, useMemo, useRef } from "react";
import { VoiceManager } from "@/features/voice/voice-manager";
import { useRealtimeStore } from "@/store/realtime-store";
import { useVoiceStore } from "@/store/voice-store";
import { isTypingTarget } from "@/three/controls/input";
import type { RealtimeActions } from "./use-realtime";

export interface VoiceActions {
  join: () => void;
  leave: () => void;
  toggleMute: () => void;
  switchDevice: (deviceId: string) => void;
}

/**
 * Owns the VoiceManager for a live museum: keeps audio connections in step
 * with who has voice on, re-announces after reconnects, and maps M to mute.
 */
export function useVoice(voiceRef: React.RefObject<VoiceManager | null>, realtime: RealtimeActions, enabled: boolean): VoiceActions {
  const sendRef = useRef(realtime.send);
  useEffect(() => {
    sendRef.current = realtime.send;
  }, [realtime.send]);

  useEffect(() => {
    if (!enabled) return;
    const manager = new VoiceManager((msg) => sendRef.current(msg));
    voiceRef.current = manager;
    const offPeers = useRealtimeStore.subscribe((s, prev) => {
      if (s.peers !== prev.peers) manager.syncPeers(s.peers);
      if (s.status === "online" && prev.status !== "online") manager.resync();
      if (s.status !== "online" && prev.status === "online") useVoiceStore.setState({ connected: {} });
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "KeyM" || e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return;
      const v = useVoiceStore.getState();
      if (v.status === "on" && !v.listenOnly) manager.setMuted(!v.muted);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      offPeers();
      manager.leave();
      voiceRef.current = null;
    };
  }, [enabled, voiceRef]);

  return useMemo<VoiceActions>(
    () => ({
      join: () => void voiceRef.current?.join(),
      leave: () => voiceRef.current?.leave(),
      toggleMute: () => voiceRef.current?.setMuted(!useVoiceStore.getState().muted),
      switchDevice: (id) => void voiceRef.current?.switchDevice(id).catch(() => undefined),
    }),
    [voiceRef],
  );
}
