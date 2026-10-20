"use client";

import { create } from "zustand";

export type VoiceStatus = "off" | "starting" | "on";
export type VoiceError = "permission_denied" | "no_microphone" | "insecure_context" | "unsupported" | "failed" | null;

interface VoiceState {
  status: VoiceStatus;
  muted: boolean;
  /** Joined without a microphone (permission denied or none available). */
  listenOnly: boolean;
  speaking: boolean;
  error: VoiceError;
  devices: Array<{ deviceId: string; label: string }>;
  deviceId: string | null;
  /** Peers we have an audio connection with, by connection id. */
  connected: Record<string, "connecting" | "connected" | "failed">;
}

export const useVoiceStore = create<VoiceState>()(() => ({
  status: "off",
  muted: false,
  listenOnly: false,
  speaking: false,
  error: null,
  devices: [],
  deviceId: null,
  connected: {},
}));
