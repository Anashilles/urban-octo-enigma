"use client";

import { create } from "zustand";
import type { Peer, SharedState, TourState } from "@/features/realtime/protocol";

export type RealtimeStatus = "idle" | "connecting" | "online" | "reconnecting" | "unavailable";

export interface FloatingReaction {
  key: number;
  photoId: string;
  emoji: string;
  from: string;
}

interface RealtimeState {
  status: RealtimeStatus;
  selfId: string | null;
  peers: Record<string, Peer>;
  shared: SharedState | null;
  /** True while this client is inside the shared viewing (leader or follower). */
  following: boolean;
  /** A shared session the visitor chose not to join (no auto-join, banner hidden). */
  dismissedSharedId: string | null;
  /** A guided tour someone is leading for everyone. */
  tour: TourState | null;
  dismissedTourId: string | null;
  reactions: FloatingReaction[];
  reset: () => void;
}

const initial = {
  status: "idle" as RealtimeStatus,
  selfId: null,
  peers: {},
  shared: null,
  following: false,
  dismissedSharedId: null,
  tour: null,
  dismissedTourId: null,
  reactions: [],
};

export const useRealtimeStore = create<RealtimeState>()((set) => ({
  ...initial,
  reset: () => set(initial),
}));

let reactionKey = 0;
export function pushReaction(r: Omit<FloatingReaction, "key">) {
  const key = ++reactionKey;
  useRealtimeStore.setState((s) => ({ reactions: [...s.reactions.slice(-20), { ...r, key }] }));
  setTimeout(() => useRealtimeStore.setState((s) => ({ reactions: s.reactions.filter((x) => x.key !== key) })), 2600);
}
