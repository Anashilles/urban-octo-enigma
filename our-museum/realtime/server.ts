import "dotenv/config";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { jwtVerify } from "jose";
import { WebSocketServer, type RawData, type WebSocket } from "ws";
import {
  CLOSE,
  INTERNAL_AUDIENCE,
  TICKET_AUDIENCE,
  TICKET_ISSUER,
  clientMessageSchema,
  internalBroadcastSchema,
  internalKickSchema,
  type ClientMessage,
  type ServerMessage,
  type TicketClaims,
} from "../src/features/realtime/protocol";
import { avatarConfigSchema } from "../src/features/avatars/config";
import { TokenBucketLimiter, type RateLimitRule } from "../src/lib/rate-limit";
import { Hub, type Conn } from "./hub";

/**
 * Our Museum realtime service: a small WebSocket server for presence,
 * avatar movement, gestures, shared viewing and WebRTC voice signalling.
 *
 *   ws(s)://host/ws   — clients send {t:"hello", ticket} first
 *   GET  /health      — liveness and room counts
 *   POST /internal/*  — notifications from the app (Bearer internal JWT)
 */

export interface RealtimeConfig {
  port: number;
  host: string;
  secret: Uint8Array;
  allowedOrigins: string[];
  maxPerRoom: number;
  maxPerUser: number;
  logLevel: "debug" | "info" | "warn" | "error";
}

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): RealtimeConfig {
  const secret = env.REALTIME_TICKET_SECRET || (env.BETTER_AUTH_SECRET ? `realtime:${env.BETTER_AUTH_SECRET}` : "");
  if (secret.length < 32) throw new Error("REALTIME_TICKET_SECRET (or BETTER_AUTH_SECRET) must be set to at least 32 characters.");
  const origins = (env.REALTIME_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  if (!origins.length && env.APP_URL) origins.push(new URL(env.APP_URL).origin);
  const level = (env.LOG_LEVEL ?? "info") as RealtimeConfig["logLevel"];
  return {
    port: Number(env.REALTIME_PORT ?? env.PORT ?? 4001),
    host: env.REALTIME_HOST ?? "0.0.0.0",
    secret: new TextEncoder().encode(secret),
    allowedOrigins: origins,
    maxPerRoom: Number(env.REALTIME_MAX_PER_ROOM ?? 32),
    maxPerUser: Number(env.REALTIME_MAX_PER_USER ?? 3),
    logLevel: level in LEVELS ? level : "info",
  };
}

const RULES: Record<"pose" | "signal" | "other" | "connect", RateLimitRule> = {
  pose: { capacity: 40, refillPerSecond: 25 },
  signal: { capacity: 150, refillPerSecond: 50 },
  other: { capacity: 25, refillPerSecond: 8 },
  connect: { capacity: 20, refillPerSecond: 0.5 },
};

const HELLO_TIMEOUT_MS = 5000;
const HEARTBEAT_MS = 15_000;
const TICK_MS = 80;
const MAX_PAYLOAD = 64 * 1024;

export interface RunningRealtime {
  server: Server;
  hub: Hub;
  port: number;
  close: () => Promise<void>;
}

export function startRealtime(config: RealtimeConfig): Promise<RunningRealtime> {
  const log = (level: keyof typeof LEVELS, event: string, data: Record<string, unknown> = {}) => {
    if (LEVELS[level] < LEVELS[config.logLevel]) return;
    // Never log tickets, SDP or other message bodies.
    const line = JSON.stringify({ time: new Date().toISOString(), level, service: "realtime", event, ...data });
    if (level === "error" || level === "warn") console.error(line);
    else console.log(line);
  };

  const hub = new Hub({ maxPerRoom: config.maxPerRoom, maxPerUser: config.maxPerUser });
  const limiter = new TokenBucketLimiter();
  const usedTickets = new Map<string, number>();
  const alive = new WeakMap<WebSocket, boolean>();

  const httpServer = createServer((req, res) => void handleHttp(req, res));
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD, perMessageDeflate: false });

  async function verifyInternal(req: IncomingMessage) {
    const auth = req.headers.authorization ?? "";
    if (!auth.startsWith("Bearer ")) return false;
    try {
      await jwtVerify(auth.slice(7), config.secret, { audience: INTERNAL_AUDIENCE, algorithms: ["HS256"] });
      return true;
    } catch {
      return false;
    }
  }

  async function readJson(req: IncomingMessage): Promise<unknown> {
    let size = 0;
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      size += (chunk as Buffer).length;
      if (size > 16 * 1024) throw new Error("too_large");
      chunks.push(chunk as Buffer);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  }

  function reply(res: ServerResponse, status: number, body: unknown) {
    res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store", "x-content-type-options": "nosniff" });
    res.end(JSON.stringify(body));
  }

  async function handleHttp(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? "/", "http://realtime");
    try {
      if (req.method === "GET" && url.pathname === "/health") return reply(res, 200, { ok: true, ...hub.stats() });
      if (req.method === "POST" && url.pathname.startsWith("/internal/")) {
        if (!(await verifyInternal(req))) return reply(res, 401, { error: "unauthorized" });
        const body = await readJson(req);
        if (url.pathname === "/internal/broadcast") {
          const { museumId, event } = internalBroadcastSchema.parse(body);
          hub.broadcastChange(museumId, event.scope, event.actorId);
          return reply(res, 200, { ok: true });
        }
        if (url.pathname === "/internal/kick") {
          const { museumId, userId, reason } = internalKickSchema.parse(body);
          const kicked = hub.kick(museumId, userId, reason);
          log("info", "kick", { museumId, kicked, reason });
          return reply(res, 200, { ok: true, kicked });
        }
      }
      reply(res, 404, { error: "not_found" });
    } catch (error) {
      log("warn", "http_error", { path: url.pathname, error: error instanceof Error ? error.message : "unknown" });
      reply(res, 400, { error: "bad_request" });
    }
  }

  httpServer.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://realtime");
    const ip = clientIp(req);
    const origin = req.headers.origin;
    const refuse = (status: number, text: string) => {
      socket.write(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
      socket.destroy();
    };
    if (url.pathname !== "/ws") return refuse(404, "Not Found");
    // Browsers always send Origin; reject pages from other sites.
    if (origin && config.allowedOrigins.length && !config.allowedOrigins.includes(origin)) {
      log("warn", "origin_rejected", { origin });
      return refuse(403, "Forbidden");
    }
    if (!limiter.take(`connect:${ip}`, RULES.connect).ok) return refuse(429, "Too Many Requests");
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  });

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const ip = clientIp(req);
    let conn: Conn | null = null;
    let violations = 0;
    alive.set(ws, true);
    ws.on("pong", () => alive.set(ws, true));

    const send = (msg: ServerMessage) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
    };
    const close = (code: number, reason: string) => {
      try {
        ws.close(code, reason);
      } catch {
        ws.terminate();
      }
    };

    const helloTimer = setTimeout(() => {
      if (!conn) close(CLOSE.timeout, "hello timeout");
    }, HELLO_TIMEOUT_MS);

    ws.on("message", (raw: RawData, isBinary: boolean) => {
      if (isBinary) return close(1003, "binary not supported");
      let msg: ClientMessage;
      try {
        const parsed = clientMessageSchema.safeParse(JSON.parse(raw.toString()));
        if (!parsed.success) throw new Error("invalid");
        msg = parsed.data;
      } catch {
        violations++;
        send({ t: "error", code: "bad_message" });
        if (violations > 50) close(1008, "too many invalid messages");
        return;
      }

      if (!conn) {
        if (msg.t !== "hello") return close(CLOSE.unauthorized, "hello required");
        void authenticate(msg.ticket).then((claims) => {
          if (!claims) {
            send({ t: "error", code: "unauthorized" });
            return close(CLOSE.unauthorized, "invalid ticket");
          }
          if (ws.readyState !== ws.OPEN) return;
          clearTimeout(helloTimer);
          const c = Hub.createConn(claims, { send, close });
          if (hub.join(c) === "room_full") {
            send({ t: "error", code: "room_full" });
            return close(CLOSE.roomFull, "room full");
          }
          conn = c;
          log("info", "join", { museumId: claims.mid, conn: c.id, ...hub.stats() });
        });
        return;
      }

      const rule = msg.t === "pose" ? "pose" : msg.t === "voice.signal" ? "signal" : "other";
      if (!limiter.take(`${rule}:${conn.id}`, RULES[rule]).ok) {
        violations++;
        if (violations === 1 || violations % 50 === 0) send({ t: "error", code: "rate_limited" });
        if (violations > 500) close(CLOSE.rateLimited, "rate limited");
        return;
      }
      hub.handle(conn, msg);
    });

    ws.on("close", () => {
      clearTimeout(helloTimer);
      if (conn) {
        hub.leave(conn);
        log("info", "leave", { museumId: conn.claims.mid, conn: conn.id, ...hub.stats() });
      }
    });
    ws.on("error", (error) => log("debug", "socket_error", { ip, error: error.message }));
  });

  async function authenticate(ticket: string): Promise<TicketClaims | null> {
    try {
      const { payload } = await jwtVerify(ticket, config.secret, { audience: TICKET_AUDIENCE, issuer: TICKET_ISSUER, algorithms: ["HS256"] });
      const jti = typeof payload.jti === "string" ? payload.jti : null;
      if (!jti || usedTickets.has(jti)) return null; // single use
      usedTickets.set(jti, (payload.exp ?? 0) * 1000);
      const p = payload as unknown as TicketClaims;
      const avatar = avatarConfigSchema.safeParse(p.avatar);
      if (typeof p.sub !== "string" || typeof p.mid !== "string" || !avatar.success) return null;
      if (!["OWNER", "EDITOR", "VISITOR"].includes(p.role)) return null;
      return {
        sub: p.sub,
        mid: p.mid,
        role: p.role,
        name: String(p.name ?? "").slice(0, 60) || "Visitor",
        guest: Boolean(p.guest),
        avatar: avatar.data,
        perms: {
          sharedStart: Boolean(p.perms?.sharedStart),
          sharedManage: Boolean(p.perms?.sharedManage),
          voice: Boolean(p.perms?.voice),
          react: Boolean(p.perms?.react),
        },
      };
    } catch {
      return null;
    }
  }

  const tick = setInterval(() => hub.tick(), TICK_MS);
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (alive.get(ws) === false) {
        ws.terminate();
        continue;
      }
      alive.set(ws, false);
      ws.ping();
    }
    const now = Date.now();
    for (const [jti, exp] of usedTickets) if (exp < now) usedTickets.delete(jti);
  }, HEARTBEAT_MS);

  return new Promise((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(config.port, config.host, () => {
      const address = httpServer.address();
      const port = typeof address === "object" && address ? address.port : config.port;
      log("info", "listening", { port, origins: config.allowedOrigins });
      resolve({
        server: httpServer,
        hub,
        port,
        close: () =>
          new Promise<void>((done) => {
            clearInterval(tick);
            clearInterval(heartbeat);
            for (const ws of wss.clients) ws.close(1001, "server shutting down");
            wss.close();
            httpServer.close(() => done());
            setTimeout(done, 2000).unref();
          }),
      });
    });
  });
}

function clientIp(req: IncomingMessage): string {
  // Only trust X-Forwarded-For when explicitly running behind a proxy.
  if (process.env.REALTIME_TRUST_PROXY === "true") {
    const fwd = req.headers["x-forwarded-for"];
    const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.socket.remoteAddress ?? "unknown";
}

// Run directly: `npm run realtime` (tsx) or `node dist/realtime/server.mjs`.
const isMain = process.argv[1] && /realtime[\\/](server\.(ts|mjs|js))$/.test(process.argv[1]);
if (isMain) {
  startRealtime(configFromEnv())
    .then((running) => {
      const stop = () => void running.close().then(() => process.exit(0));
      process.on("SIGTERM", stop);
      process.on("SIGINT", stop);
    })
    .catch((error) => {
      console.error(JSON.stringify({ level: "error", service: "realtime", event: "start_failed", error: error instanceof Error ? error.message : String(error) }));
      process.exit(1);
    });
}
