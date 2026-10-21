import "server-only";
import { createHmac } from "node:crypto";
import { env } from "@/lib/env";

export interface IceServer {
  urls: string[];
  username?: string;
  credential?: string;
}

const TURN_TTL_SECONDS = 60 * 60;

/**
 * ICE servers for voice chat. STUN and TURN come from the environment
 * (STUN_URLS, TURN_URLS, TURN_SHARED_SECRET). TURN credentials are minted per
 * user with the "TURN REST API" scheme supported by coturn:
 * username = "<expiry>:<userId>", credential = base64(HMAC-SHA1(secret, username)).
 * Without configured servers, only direct (host) connections are possible.
 * VOICE_RELAY_ONLY makes browsers use the TURN relay exclusively, so
 * participants never see each other's IP addresses.
 */
export function iceServersFor(
  userId: string,
  now = Date.now(),
): { iceServers: IceServer[]; ttlSeconds: number; relay: boolean; iceTransportPolicy: "all" | "relay" } {
  const e = env();
  const servers: IceServer[] = [];
  if (e.STUN_URLS.length) servers.push({ urls: e.STUN_URLS });
  const relay = Boolean(e.TURN_URLS.length && e.TURN_SHARED_SECRET);
  if (relay) {
    const username = `${Math.floor(now / 1000) + TURN_TTL_SECONDS}:${userId}`;
    const credential = createHmac("sha1", e.TURN_SHARED_SECRET!).update(username).digest("base64");
    servers.push({ urls: e.TURN_URLS, username, credential });
  }
  // Relay-only fails closed: without TURN, voice does not connect rather than exposing addresses.
  return { iceServers: servers, ttlSeconds: TURN_TTL_SECONDS, relay, iceTransportPolicy: e.VOICE_RELAY_ONLY ? "relay" : "all" };
}
