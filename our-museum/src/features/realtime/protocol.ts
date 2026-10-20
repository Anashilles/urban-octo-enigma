import { z } from "zod";
import type { AvatarConfig } from "../avatars/config";

/**
 * Wire protocol between browsers and the realtime service (realtime/server.ts).
 * Shared by both sides — keep this file free of "@/" imports so the service
 * can load it directly.
 *
 * Every client message is validated with these schemas on the server; the
 * server never trusts identity, role or permissions sent by a client — those
 * come from the signed ticket issued by the app after a membership check.
 */

export const TICKET_AUDIENCE = "our-museum-realtime";
export const INTERNAL_AUDIENCE = "our-museum-realtime-internal";
export const TICKET_ISSUER = "our-museum";
export const TICKET_TTL_SECONDS = 60;

export const REACTION_EMOJIS = ["❤️", "😂", "😮", "😢", "👏", "✨"] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

/** Claims carried by a realtime ticket (a short-lived HS256 JWT). */
export interface TicketClaims {
  sub: string;
  mid: string;
  role: "OWNER" | "EDITOR" | "VISITOR";
  name: string;
  guest: boolean;
  avatar: AvatarConfig;
  perms: {
    sharedStart: boolean;
    sharedManage: boolean;
    voice: boolean;
    react: boolean;
  };
}

export interface VoiceState {
  on: boolean;
  muted: boolean;
  speaking: boolean;
}

export interface Peer {
  /** Connection id (one person may have several tabs open). */
  id: string;
  userId: string;
  name: string;
  role: TicketClaims["role"];
  guest: boolean;
  avatar: AvatarConfig;
  viewing: string | null;
  voice: VoiceState;
  joinedAt: number;
}

export interface SharedState {
  id: string;
  leaderId: string;
  leaderName: string;
  photoId: string;
  sequence: string[];
  zoom: number;
  panX: number;
  panY: number;
  participants: string[];
  startedAt: number;
}

/** [id, x, z, yaw, pitch, speed, running(0|1), roomId] */
export type PoseTuple = [string, number, number, number, number, number, 0 | 1, string | null];

const id = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);
const coord = z.number().finite().min(-1000).max(1000);
const angle = z.number().finite().min(-100).max(100);

export const clientMessageSchema = z.discriminatedUnion("t", [
  z.object({ t: z.literal("hello"), ticket: z.string().min(20).max(8000) }),
  z.object({
    t: z.literal("pose"),
    x: coord,
    z: coord,
    yaw: angle,
    pitch: z.number().finite().min(-2).max(2),
    speed: z.number().finite().min(0).max(20),
    running: z.boolean(),
    room: id.nullable(),
  }),
  z.object({ t: z.literal("gesture"), g: z.enum(["wave"]) }),
  z.object({ t: z.literal("viewing"), photoId: id.nullable() }),
  z.object({ t: z.literal("shared.start"), photoId: id, sequence: z.array(id).max(1000) }),
  z.object({
    t: z.literal("shared.update"),
    photoId: id,
    zoom: z.number().finite().min(1).max(8).optional(),
    panX: z.number().finite().min(-10000).max(10000).optional(),
    panY: z.number().finite().min(-10000).max(10000).optional(),
  }),
  z.object({ t: z.literal("shared.end") }),
  z.object({ t: z.literal("shared.join") }),
  z.object({ t: z.literal("shared.leave") }),
  z.object({ t: z.literal("react"), photoId: id, emoji: z.enum(REACTION_EMOJIS) }),
  z.object({ t: z.literal("voice.state"), on: z.boolean(), muted: z.boolean(), speaking: z.boolean() }),
  z.object({
    t: z.literal("voice.signal"),
    to: id,
    data: z.object({
      type: z.enum(["offer", "answer", "candidate", "bye"]),
      sdp: z.string().max(30_000).optional(),
      candidate: z
        .object({
          candidate: z.string().max(2000),
          sdpMid: z.string().max(64).nullable().optional(),
          sdpMLineIndex: z.number().int().min(0).max(64).nullable().optional(),
          usernameFragment: z.string().max(256).nullable().optional(),
        })
        .optional(),
    }),
  }),
  z.object({ t: z.literal("ping"), ts: z.number().finite() }),
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;
export type VoiceSignal = Extract<ClientMessage, { t: "voice.signal" }>["data"];

export type ChangeScope = "layout" | "photos" | "museum" | "members" | "tours";

export type ServerMessage =
  | { t: "welcome"; self: Peer; peers: Peer[]; shared: SharedState | null; now: number }
  | { t: "peer.join"; peer: Peer }
  | { t: "peer.leave"; id: string }
  | { t: "peer.update"; id: string; patch: Partial<Pick<Peer, "viewing" | "voice">> }
  | { t: "poses"; list: PoseTuple[] }
  | { t: "gesture"; id: string; g: "wave" }
  | { t: "shared"; state: SharedState | null }
  | { t: "react"; id: string; photoId: string; emoji: ReactionEmoji }
  | { t: "voice.signal"; from: string; data: VoiceSignal }
  | { t: "museum.changed"; scope: ChangeScope; actorId: string | null }
  | { t: "kicked"; reason: "removed" | "deleted" | "replaced" }
  | { t: "error"; code: ErrorCode; message?: string }
  | { t: "pong"; ts: number; now: number };

export type ErrorCode =
  | "bad_message"
  | "unauthorized"
  | "forbidden"
  | "rate_limited"
  | "room_full"
  | "shared_busy"
  | "not_leader"
  | "unknown_peer";

/** WebSocket close codes used by the service (4000–4999 are application-defined). */
export const CLOSE = {
  unauthorized: 4001,
  forbidden: 4003,
  kicked: 4004,
  roomFull: 4008,
  timeout: 4009,
  rateLimited: 4029,
} as const;

export const internalBroadcastSchema = z.object({
  museumId: id,
  event: z.object({
    type: z.literal("museum.changed"),
    scope: z.enum(["layout", "photos", "museum", "members", "tours"]),
    actorId: id.nullable(),
  }),
});

export const internalKickSchema = z.object({
  museumId: id,
  userId: id.nullable(),
  reason: z.enum(["removed", "deleted"]),
});
