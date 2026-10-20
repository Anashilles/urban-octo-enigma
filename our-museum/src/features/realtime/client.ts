"use client";

import { ApiError, api } from "@/lib/api/client";
import { pushReaction, useRealtimeStore } from "@/store/realtime-store";
import { player } from "@/three/runtime";
import { CLOSE, type ChangeScope, type ClientMessage, type ServerMessage, type VoiceSignal } from "./protocol";
import { clearPoses, forgetPeer, pushPose } from "./remote-poses";

export interface RealtimeHandlers {
  onMuseumChanged?: (scope: ChangeScope, actorId: string | null) => void;
  onKicked?: (reason: "removed" | "deleted" | "replaced") => void;
  onGesture?: (peerId: string, gesture: "wave") => void;
  onVoiceSignal?: (from: string, data: VoiceSignal) => void;
  onPeerLeave?: (peerId: string) => void;
  onError?: (code: string, message?: string) => void;
}

const POSE_INTERVAL_MS = 80;
const POSE_KEEPALIVE_MS = 1000;
const MAX_BACKOFF_MS = 20_000;

/**
 * Browser side of the realtime service: fetches a single-use ticket from the
 * app, connects, and keeps the shared store in sync. Reconnects with
 * exponential backoff and jitter; a fresh ticket (and membership check) is
 * fetched for every attempt.
 */
export class RealtimeClient {
  private ws: WebSocket | null = null;
  private stopped = true;
  private attempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private poseTimer: ReturnType<typeof setInterval> | null = null;
  private lastPose = { x: NaN, z: NaN, yaw: NaN, pitch: NaN, speed: NaN, running: false, sentAt: 0 };
  private readonly onOnline = () => {
    if (!this.stopped && (!this.ws || this.ws.readyState > WebSocket.OPEN)) this.reconnectNow();
  };

  constructor(
    private readonly museumId: string,
    private readonly handlers: RealtimeHandlers = {},
  ) {}

  start() {
    if (!this.stopped) return;
    this.stopped = false;
    window.addEventListener("online", this.onOnline);
    useRealtimeStore.setState({ status: "connecting" });
    void this.connect();
  }

  stop() {
    this.stopped = true;
    window.removeEventListener("online", this.onOnline);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.poseTimer) clearInterval(this.poseTimer);
    this.retryTimer = null;
    this.poseTimer = null;
    const ws = this.ws;
    this.ws = null;
    ws?.close(1000, "leaving");
    clearPoses();
    useRealtimeStore.getState().reset();
  }

  get connected() {
    return this.ws?.readyState === WebSocket.OPEN && useRealtimeStore.getState().status === "online";
  }

  send(msg: ClientMessage) {
    if (this.ws?.readyState === WebSocket.OPEN && msg.t !== "hello") this.ws.send(JSON.stringify(msg));
  }

  private reconnectNow() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.attempt = 0;
    void this.connect();
  }

  private scheduleReconnect(delayOverride?: number) {
    if (this.stopped) return;
    const base = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** this.attempt);
    const delay = delayOverride ?? base * (0.7 + Math.random() * 0.6);
    this.attempt++;
    useRealtimeStore.setState({ status: "reconnecting" });
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => void this.connect(), delay);
  }

  private async connect() {
    if (this.stopped) return;
    let ticket: { ticket: string; url: string };
    try {
      ticket = await api(`/api/museums/${this.museumId}/realtime-ticket`, { method: "POST" });
    } catch (e) {
      // No access any more (removed, museum deleted): stop trying.
      if (e instanceof ApiError && (e.status === 401 || e.status === 403 || e.status === 404)) {
        useRealtimeStore.setState({ status: "unavailable" });
        return;
      }
      const retry = e instanceof ApiError && e.code === "RATE_LIMITED" ? 15_000 : undefined;
      return this.scheduleReconnect(retry);
    }
    if (this.stopped) return;

    let ws: WebSocket;
    try {
      ws = new WebSocket(`${ticket.url.replace(/\/$/, "")}/ws`);
    } catch {
      return this.scheduleReconnect();
    }
    this.ws = ws;
    ws.onopen = () => ws.send(JSON.stringify({ t: "hello", ticket: ticket.ticket }));
    ws.onmessage = (ev) => {
      if (this.ws !== ws) return;
      try {
        this.dispatch(JSON.parse(String(ev.data)) as ServerMessage);
      } catch {
        // Ignore malformed frames.
      }
    };
    ws.onclose = (ev) => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.poseTimer) clearInterval(this.poseTimer);
      this.poseTimer = null;
      clearPoses();
      useRealtimeStore.setState({ peers: {}, shared: null, following: false, selfId: null });
      if (this.stopped) return;
      if (ev.code === CLOSE.kicked) return; // handled by the "kicked" message
      if (ev.code === CLOSE.roomFull) return this.scheduleReconnect(30_000);
      this.scheduleReconnect();
    };
  }

  private dispatch(msg: ServerMessage) {
    const store = useRealtimeStore;
    switch (msg.t) {
      case "welcome": {
        this.attempt = 0;
        const peers = Object.fromEntries(msg.peers.map((p) => [p.id, p]));
        store.setState({ status: "online", selfId: msg.self.id, peers, shared: msg.shared, following: false });
        this.startPoseLoop();
        return;
      }
      case "peer.join":
        store.setState((s) => ({ peers: { ...s.peers, [msg.peer.id]: msg.peer } }));
        return;
      case "peer.leave":
        forgetPeer(msg.id);
        store.setState((s) => {
          const peers = { ...s.peers };
          delete peers[msg.id];
          return { peers };
        });
        this.handlers.onPeerLeave?.(msg.id);
        return;
      case "peer.update":
        store.setState((s) => (s.peers[msg.id] ? { peers: { ...s.peers, [msg.id]: { ...s.peers[msg.id]!, ...msg.patch } } } : {}));
        return;
      case "poses": {
        const self = store.getState().selfId;
        const now = performance.now();
        for (const p of msg.list) if (p[0] !== self) pushPose(p, now);
        return;
      }
      case "gesture":
        this.handlers.onGesture?.(msg.id, msg.g);
        return;
      case "shared":
        store.setState((s) => ({ shared: msg.state, following: msg.state ? s.following && s.shared?.id === msg.state.id : false }));
        return;
      case "react":
        pushReaction({ photoId: msg.photoId, emoji: msg.emoji, from: msg.id });
        return;
      case "voice.signal":
        this.handlers.onVoiceSignal?.(msg.from, msg.data);
        return;
      case "museum.changed":
        this.handlers.onMuseumChanged?.(msg.scope, msg.actorId);
        return;
      case "kicked":
        this.stopped = true;
        store.setState({ status: "unavailable" });
        this.handlers.onKicked?.(msg.reason);
        return;
      case "error":
        this.handlers.onError?.(msg.code, msg.message);
        return;
      case "pong":
        return;
    }
  }

  private startPoseLoop() {
    if (this.poseTimer) clearInterval(this.poseTimer);
    this.lastPose.sentAt = 0;
    this.poseTimer = setInterval(() => {
      const p = player;
      const l = this.lastPose;
      const now = performance.now();
      const moved =
        !(Math.abs(p.x - l.x) < 0.01) ||
        !(Math.abs(p.z - l.z) < 0.01) ||
        !(Math.abs(p.yaw - l.yaw) < 0.01) ||
        !(Math.abs(p.pitch - l.pitch) < 0.02) ||
        !(Math.abs(p.speed - l.speed) < 0.05) ||
        p.running !== l.running;
      if (!moved && now - l.sentAt < POSE_KEEPALIVE_MS) return;
      const yaw = Math.atan2(Math.sin(p.yaw), Math.cos(p.yaw));
      this.send({ t: "pose", x: p.x, z: p.z, yaw, pitch: Math.max(-2, Math.min(2, p.pitch)), speed: Math.min(20, p.speed), running: p.running, room: p.roomId });
      this.lastPose = { x: p.x, z: p.z, yaw: p.yaw, pitch: p.pitch, speed: p.speed, running: p.running, sentAt: now };
    }, POSE_INTERVAL_MS);
  }
}
