import { randomUUID } from "node:crypto";
import type {
  ChangeScope,
  ClientMessage,
  ErrorCode,
  Peer,
  PoseTuple,
  ServerMessage,
  SharedState,
  TicketClaims,
  TourState,
} from "../src/features/realtime/protocol";

/**
 * Transport-independent core of the realtime service: rooms (one per museum),
 * presence, pose fan-out, gestures, shared viewing ("Look Together") and
 * voice signalling. Every permission check uses the claims from the verified
 * ticket, never data sent by the client.
 */

export interface Conn {
  readonly id: string;
  readonly claims: TicketClaims;
  readonly peer: Peer;
  pose: PoseTuple | null;
  send(msg: ServerMessage): void;
  close(code: number, reason: string): void;
}

interface Room {
  id: string;
  conns: Map<string, Conn>;
  shared: SharedState | null;
  tour: TourState | null;
  dirty: Set<string>;
}

export interface HubOptions {
  maxPerRoom: number;
  maxPerUser: number;
  now?: () => number;
}

export type JoinResult = "ok" | "room_full";

export class Hub {
  private readonly rooms = new Map<string, Room>();
  private readonly now: () => number;

  constructor(private readonly opts: HubOptions) {
    this.now = opts.now ?? (() => Date.now());
  }

  static createConn(claims: TicketClaims, io: Pick<Conn, "send" | "close">, now = Date.now()): Conn {
    const id = randomUUID().replace(/-/g, "").slice(0, 16);
    return {
      id,
      claims,
      pose: null,
      peer: {
        id,
        userId: claims.sub,
        name: claims.name,
        role: claims.role,
        guest: claims.guest,
        avatar: claims.avatar,
        viewing: null,
        voice: { on: false, muted: true, speaking: false },
        joinedAt: now,
      },
      send: io.send,
      close: io.close,
    };
  }

  join(conn: Conn): JoinResult {
    const existing = this.rooms.get(conn.claims.mid);
    const sameUser = existing ? [...existing.conns.values()].filter((c) => c.claims.sub === conn.claims.sub) : [];
    // Too many tabs for one person: the oldest connection gives way.
    if (sameUser.length >= this.opts.maxPerUser) {
      const oldest = sameUser.sort((a, b) => a.peer.joinedAt - b.peer.joinedAt)[0]!;
      oldest.send({ t: "kicked", reason: "replaced" });
      oldest.close(4004, "replaced");
      this.leave(oldest);
    }
    if ((this.rooms.get(conn.claims.mid)?.conns.size ?? 0) >= this.opts.maxPerRoom) return "room_full";
    const room = this.room(conn.claims.mid);
    room.conns.set(conn.id, conn);
    conn.send({ t: "welcome", self: conn.peer, peers: [...room.conns.values()].filter((c) => c !== conn).map((c) => c.peer), shared: room.shared, tour: room.tour, now: this.now() });
    const poses = [...room.conns.values()].filter((c) => c !== conn && c.pose).map((c) => c.pose!);
    if (poses.length) conn.send({ t: "poses", list: poses });
    this.broadcast(room, { t: "peer.join", peer: conn.peer }, conn);
    return "ok";
  }

  leave(conn: Conn) {
    const room = this.rooms.get(conn.claims.mid);
    if (!room || room.conns.get(conn.id) !== conn) return;
    room.conns.delete(conn.id);
    room.dirty.delete(conn.id);
    this.broadcast(room, { t: "peer.leave", id: conn.id });
    if (room.tour?.leaderId === conn.id) this.setTour(room, null);
    if (room.shared) {
      if (room.shared.leaderId === conn.id) this.setShared(room, null);
      else if (room.shared.participants.includes(conn.id)) {
        this.setShared(room, { ...room.shared, participants: room.shared.participants.filter((p) => p !== conn.id) });
      }
    }
    if (room.conns.size === 0) this.rooms.delete(room.id);
  }

  handle(conn: Conn, msg: ClientMessage) {
    const room = this.rooms.get(conn.claims.mid);
    if (!room || room.conns.get(conn.id) !== conn) return;
    const deny = (code: ErrorCode, message?: string) => conn.send({ t: "error", code, message });
    switch (msg.t) {
      case "hello":
        return; // handled by the transport
      case "ping":
        return conn.send({ t: "pong", ts: msg.ts, now: this.now() });
      case "pose":
        conn.pose = [conn.id, round(msg.x), round(msg.z), round(msg.yaw, 3), round(msg.pitch, 3), round(msg.speed), msg.running ? 1 : 0, msg.room];
        room.dirty.add(conn.id);
        return;
      case "gesture":
        return this.broadcast(room, { t: "gesture", id: conn.id, g: msg.g }, conn);
      case "viewing":
        if (conn.peer.viewing === msg.photoId) return;
        conn.peer.viewing = msg.photoId;
        return this.broadcast(room, { t: "peer.update", id: conn.id, patch: { viewing: msg.photoId } }, conn);
      case "shared.start": {
        if (!conn.claims.perms.sharedStart) return deny("forbidden", "You can't start a shared viewing in this museum.");
        if (room.shared && room.shared.leaderId !== conn.id && !conn.claims.perms.sharedManage) return deny("shared_busy");
        return this.setShared(room, {
          id: randomUUID(),
          leaderId: conn.id,
          leaderName: conn.claims.name,
          photoId: msg.photoId,
          sequence: msg.sequence.length ? msg.sequence : [msg.photoId],
          zoom: 1,
          panX: 0,
          panY: 0,
          participants: [conn.id],
          startedAt: this.now(),
        });
      }
      case "shared.update": {
        if (!room.shared || room.shared.leaderId !== conn.id) return deny("not_leader");
        const changedPhoto = msg.photoId !== room.shared.photoId;
        return this.setShared(room, {
          ...room.shared,
          photoId: msg.photoId,
          // A new photograph starts unzoomed unless the leader says otherwise.
          zoom: msg.zoom ?? (changedPhoto ? 1 : room.shared.zoom),
          panX: msg.panX ?? (changedPhoto ? 0 : room.shared.panX),
          panY: msg.panY ?? (changedPhoto ? 0 : room.shared.panY),
        });
      }
      case "shared.end":
        if (!room.shared) return;
        if (room.shared.leaderId !== conn.id && !conn.claims.perms.sharedManage) return deny("not_leader");
        return this.setShared(room, null);
      case "shared.join":
        if (!room.shared || room.shared.participants.includes(conn.id)) return;
        return this.setShared(room, { ...room.shared, participants: [...room.shared.participants, conn.id] });
      case "shared.leave":
        if (!room.shared) return;
        if (room.shared.leaderId === conn.id) return this.setShared(room, null);
        if (!room.shared.participants.includes(conn.id)) return;
        return this.setShared(room, { ...room.shared, participants: room.shared.participants.filter((p) => p !== conn.id) });
      case "tour.start":
        if (!conn.claims.perms.tour) return deny("forbidden", "You can't lead tours in this museum.");
        if (room.tour && room.tour.leaderId !== conn.id && !conn.claims.perms.sharedManage) return deny("tour_busy");
        return this.setTour(room, { id: randomUUID(), tourId: msg.tourId, leaderId: conn.id, leaderName: conn.claims.name, index: msg.index, startedAt: this.now() });
      case "tour.step":
        if (!room.tour || room.tour.leaderId !== conn.id) return deny("not_leader");
        if (room.tour.index === msg.index) return;
        return this.setTour(room, { ...room.tour, index: msg.index });
      case "tour.end":
        if (!room.tour) return;
        if (room.tour.leaderId !== conn.id && !conn.claims.perms.sharedManage) return deny("not_leader");
        return this.setTour(room, null);
      case "react":
        if (!conn.claims.perms.react) return deny("forbidden");
        return this.broadcast(room, { t: "react", id: conn.id, photoId: msg.photoId, emoji: msg.emoji }, conn);
      case "voice.state": {
        if (!conn.claims.perms.voice) return deny("forbidden", "Voice chat is not available to you in this museum.");
        const voice = { on: msg.on, muted: msg.muted || !msg.on, speaking: msg.on && !msg.muted && msg.speaking };
        const v = conn.peer.voice;
        if (v.on === voice.on && v.muted === voice.muted && v.speaking === voice.speaking) return;
        conn.peer.voice = voice;
        return this.broadcast(room, { t: "peer.update", id: conn.id, patch: { voice } }, conn);
      }
      case "voice.signal": {
        if (!conn.claims.perms.voice || !conn.peer.voice.on) return deny("forbidden");
        const target = room.conns.get(msg.to);
        // Only relay between two people who both have voice switched on.
        if (!target || target === conn || !target.peer.voice.on) return deny("unknown_peer");
        return target.send({ t: "voice.signal", from: conn.id, data: msg.data });
      }
    }
  }

  /** Sends batched poses that changed since the last tick. */
  tick() {
    for (const room of this.rooms.values()) {
      if (room.dirty.size === 0) continue;
      const list: PoseTuple[] = [];
      for (const id of room.dirty) {
        const pose = room.conns.get(id)?.pose;
        if (pose) list.push(pose);
      }
      room.dirty.clear();
      if (list.length) this.broadcast(room, { t: "poses", list });
    }
  }

  broadcastChange(museumId: string, scope: ChangeScope, actorId: string | null) {
    const room = this.rooms.get(museumId);
    if (room) this.broadcast(room, { t: "museum.changed", scope, actorId });
  }

  /** Disconnects one user (removed from the museum) or everyone (museum deleted). */
  kick(museumId: string, userId: string | null, reason: "removed" | "deleted") {
    const room = this.rooms.get(museumId);
    if (!room) return 0;
    const targets = [...room.conns.values()].filter((c) => userId === null || c.claims.sub === userId);
    for (const c of targets) {
      c.send({ t: "kicked", reason });
      c.close(4004, reason);
      this.leave(c);
    }
    return targets.length;
  }

  stats() {
    let conns = 0;
    for (const r of this.rooms.values()) conns += r.conns.size;
    return { rooms: this.rooms.size, connections: conns };
  }

  sharedFor(museumId: string) {
    return this.rooms.get(museumId)?.shared ?? null;
  }

  private room(id: string): Room {
    let room = this.rooms.get(id);
    if (!room) this.rooms.set(id, (room = { id, conns: new Map(), shared: null, tour: null, dirty: new Set() }));
    return room;
  }

  private setTour(room: Room, state: TourState | null) {
    room.tour = state;
    this.broadcast(room, { t: "tour", state });
  }

  private setShared(room: Room, state: SharedState | null) {
    room.shared = state;
    this.broadcast(room, { t: "shared", state });
  }

  private broadcast(room: Room, msg: ServerMessage, except?: Conn) {
    for (const c of room.conns.values()) if (c !== except) c.send(msg);
  }
}

function round(n: number, digits = 2) {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
