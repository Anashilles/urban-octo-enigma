"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, type RefObject } from "react";
import { toast } from "sonner";
import type { SharedView } from "@/components/museum/PhotoViewer";
import { RealtimeClient } from "@/features/realtime/client";
import type { VoiceManager } from "@/features/voice/voice-manager";
import type { ClientMessage, ReactionEmoji, SharedState } from "@/features/realtime/protocol";
import { emitRemoteGesture, latestPose } from "@/features/realtime/remote-poses";
import { useT } from "@/i18n/client";
import { useMuseumStore } from "@/store/museum-store";
import { usePreferences } from "@/store/preferences";
import { pushReaction, useRealtimeStore } from "@/store/realtime-store";
import { emitLocalGesture, onLocalGesture, requestMove } from "@/three/runtime";

export interface RealtimeActions {
  send: (msg: ClientMessage) => void;
  client: () => RealtimeClient | null;
  startShared: (photoId: string, sequence: string[]) => void;
  joinShared: () => void;
  leaveShared: () => void;
  endShared: () => void;
  /** Leader navigation / framing inside the viewer. */
  onViewerNavigate: (photoId: string) => void;
  onViewChange: (view: SharedView) => void;
  onViewerClose: () => void;
  react: (photoId: string, emoji: ReactionEmoji) => void;
  wave: () => void;
  goToPeer: (peerId: string) => void;
}

function openSharedViewer(state: SharedState) {
  useMuseumStore.getState().openViewer({ photoId: state.photoId, frameId: null, sequence: state.sequence, shared: true });
}

/**
 * Connects the live museum to the realtime service and implements presence,
 * gestures and "Look Together" (shared viewing) on top of it.
 */
export function useRealtime(
  museumId: string,
  opts: { selfUserId: string | null; refresh: () => Promise<void> | void; enabled: boolean; voice?: RefObject<VoiceManager | null> },
): RealtimeActions {
  const t = useT();
  const router = useRouter();
  const clientRef = useRef<RealtimeClient | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewThrottle = useRef<{ last: number; timer: ReturnType<typeof setTimeout> | null; pending: SharedView | null }>({ last: 0, timer: null, pending: null });
  const { selfUserId, refresh, enabled, voice } = opts;
  const tRef = useRef(t);
  const refreshRef = useRef(refresh);
  useEffect(() => {
    tRef.current = t;
    refreshRef.current = refresh;
  }, [t, refresh]);

  // Connection lifecycle.
  useEffect(() => {
    if (!enabled) return;
    const client = new RealtimeClient(museumId, {
      onMuseumChanged: (_scope, actorId) => {
        if (actorId && actorId === selfUserId) return; // our own change, already applied
        if (refreshTimer.current) clearTimeout(refreshTimer.current);
        refreshTimer.current = setTimeout(() => void refreshRef.current(), 300);
      },
      onKicked: (reason) => {
        const tr = tRef.current;
        if (reason === "replaced") {
          toast(tr("museum.live.replaced"));
          return;
        }
        toast.error(reason === "deleted" ? tr("museum.live.deleted") : tr("museum.live.kicked"));
        router.push("/dashboard");
      },
      onGesture: (peerId, g) => {
        emitRemoteGesture(peerId, g);
        const peer = useRealtimeStore.getState().peers[peerId];
        if (peer && g === "wave") toast(tRef.current("museum.live.waved", { name: peer.name }), { duration: 2500 });
      },
      onVoiceSignal: (from, data) => void voice?.current?.handleSignal(from, data).catch(() => undefined),
      onPeerLeave: (id) => voice?.current?.peerLeft(id),
      onError: (code) => {
        if (code === "shared_busy") toast(tRef.current("museum.live.sharedBusy"));
      },
    });
    clientRef.current = client;
    client.start();
    const offGesture = onLocalGesture((g) => client.send({ t: "gesture", g }));
    return () => {
      offGesture();
      client.stop();
      clientRef.current = null;
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [museumId, selfUserId, enabled, router, voice]);

  // Presence: what this visitor is looking at.
  useEffect(
    () =>
      useMuseumStore.subscribe((s, prev) => {
        if (s.viewer?.photoId !== prev.viewer?.photoId) clientRef.current?.send({ t: "viewing", photoId: s.viewer?.photoId ?? null });
      }),
    [],
  );

  // Shared viewing transitions.
  useEffect(
    () =>
      useRealtimeStore.subscribe((s, prev) => {
        const next = s.shared;
        const before = prev.shared;
        const museum = useMuseumStore.getState();
        if (next && next.id !== before?.id) {
          if (next.leaderId === s.selfId) {
            useRealtimeStore.setState({ following: true });
            return;
          }
          // Someone else started: follow automatically unless busy or opted out.
          const busy = Boolean(museum.viewer && !museum.viewer.shared) || museum.inputBlockers > 0 || Boolean(museum.placement);
          if (usePreferences.getState().autoFollowShared && !busy && s.dismissedSharedId !== next.id) {
            clientRef.current?.send({ t: "shared.join" });
            useRealtimeStore.setState({ following: true });
            openSharedViewer(next);
          }
          return;
        }
        if (next && s.following && next.leaderId !== s.selfId) {
          const viewer = museum.viewer;
          if (!viewer || !viewer.shared) openSharedViewer(next);
          else if (viewer.photoId !== next.photoId) useMuseumStore.setState({ viewer: { ...viewer, photoId: next.photoId, sequence: next.sequence } });
          return;
        }
        if (!next && before) {
          const wasFollowing = prev.following && before.leaderId !== prev.selfId;
          if (wasFollowing && museum.viewer?.shared) {
            museum.closeViewer();
            toast(tRef.current("museum.live.sharedEnded"));
            return;
          }
          // The leader keeps looking, now privately.
          if (museum.viewer?.shared) useMuseumStore.setState({ viewer: { ...museum.viewer, shared: false } });
        }
      }),
    [],
  );

  const send = useCallback((msg: ClientMessage) => clientRef.current?.send(msg), []);

  return useMemo<RealtimeActions>(() => {
    const isLeader = () => {
      const s = useRealtimeStore.getState();
      return Boolean(s.shared && s.shared.leaderId === s.selfId);
    };
    const flushView = () => {
      const v = viewThrottle.current;
      v.timer = null;
      const s = useRealtimeStore.getState();
      if (!v.pending || !s.shared || !isLeader()) return;
      v.last = performance.now();
      send({ t: "shared.update", photoId: s.shared.photoId, zoom: v.pending.zoom, panX: v.pending.panX, panY: v.pending.panY });
      v.pending = null;
    };
    return {
      send,
      client: () => clientRef.current,
      startShared: (photoId, sequence) => {
        send({ t: "shared.start", photoId, sequence: sequence.slice(0, 1000) });
        const viewer = useMuseumStore.getState().viewer;
        if (viewer) useMuseumStore.setState({ viewer: { ...viewer, shared: true } });
      },
      joinShared: () => {
        const s = useRealtimeStore.getState();
        if (!s.shared) return;
        send({ t: "shared.join" });
        useRealtimeStore.setState({ following: true, dismissedSharedId: null });
        openSharedViewer(s.shared);
      },
      leaveShared: () => {
        const s = useRealtimeStore.getState();
        if (!s.shared) return;
        send({ t: isLeader() ? "shared.end" : "shared.leave" });
        useRealtimeStore.setState({ following: false, dismissedSharedId: s.shared.id });
        const viewer = useMuseumStore.getState().viewer;
        if (viewer?.shared) useMuseumStore.setState({ viewer: { ...viewer, shared: false } });
      },
      endShared: () => send({ t: "shared.end" }),
      onViewerNavigate: (photoId) => {
        if (isLeader()) send({ t: "shared.update", photoId });
      },
      onViewChange: (view) => {
        if (!isLeader()) return;
        // At most ~8 framing updates per second.
        const v = viewThrottle.current;
        v.pending = view;
        if (v.timer) return;
        v.timer = setTimeout(flushView, Math.max(0, 120 - (performance.now() - v.last)));
      },
      onViewerClose: () => {
        const s = useRealtimeStore.getState();
        if (!s.shared || !s.following) return;
        send({ t: isLeader() ? "shared.end" : "shared.leave" });
        useRealtimeStore.setState({ following: false, dismissedSharedId: s.shared.id });
      },
      react: (photoId, emoji) => {
        send({ t: "react", photoId, emoji });
        pushReaction({ photoId, emoji, from: useRealtimeStore.getState().selfId ?? "self" });
      },
      // The local avatar plays it and the gesture subscription forwards it to others.
      wave: () => emitLocalGesture("wave"),
      goToPeer: (peerId) => {
        const p = latestPose(peerId);
        if (!p) return;
        // Arrive just behind and beside them, looking the same way: you see them and what they see.
        const fx = -Math.sin(p.yaw);
        const fz = -Math.cos(p.yaw);
        const rx = Math.cos(p.yaw);
        const rz = -Math.sin(p.yaw);
        requestMove({ x: p.x + rx * 0.9 - fx * 1.7, z: p.z + rz * 0.9 - fz * 1.7, yaw: p.yaw, duration: 0.9 });
      },
    };
  }, [send]);
}
