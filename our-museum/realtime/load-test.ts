/**
 * Load test for the realtime service: simulated visitors walking around.
 *
 *   REALTIME_TICKET_SECRET=… npx tsx realtime/load-test.ts \
 *     --url ws://127.0.0.1:4001 --origin http://localhost:3000 \
 *     --rooms 20 --per-room 10 --seconds 30 [--pid <realtime server pid>]
 *
 * Every client sends a pose every 80 ms (what a moving browser sends). One
 * probe per room encodes a sequence number in its position so the others can
 * measure end-to-end delay. With --pid, the server's CPU time and memory are
 * read from /proc (Linux). The server must run with REALTIME_TRUST_PROXY=true:
 * each client presents its own X-Forwarded-For address, otherwise the per-IP
 * connection limit (correctly) refuses a crowd arriving from one machine.
 * Tickets are signed locally with the shared secret — never point this at a
 * deployment whose secret you would have to copy around.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { SignJWT } from "jose";
import WebSocket from "ws";
import { defaultAvatar } from "../src/features/avatars/config";
import { TICKET_AUDIENCE, TICKET_ISSUER, type ServerMessage } from "../src/features/realtime/protocol";

function arg(name: string, fallback: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

const url = arg("url", "ws://127.0.0.1:4001");
const origin = arg("origin", "http://localhost:3000");
const rooms = Number(arg("rooms", "1"));
const perRoom = Number(arg("per-room", "10"));
const seconds = Number(arg("seconds", "20"));
const pid = arg("pid", "");
const secretText = process.env.REALTIME_TICKET_SECRET ?? "";
if (secretText.length < 32) throw new Error("REALTIME_TICKET_SECRET (≥ 32 chars) is required");
const secret = new TextEncoder().encode(secretText);

const POSE_MS = 80;

function procStats(p: string) {
  const stat = readFileSync(`/proc/${p}/stat`, "utf8").split(") ")[1]!.split(" ");
  const ticks = Number(stat[11]) + Number(stat[12]); // utime + stime
  const rssKb = Number(/VmRSS:\s+(\d+)/.exec(readFileSync(`/proc/${p}/status`, "utf8"))?.[1] ?? 0);
  return { cpuSeconds: ticks / 100, rssMb: rssKb / 1024 };
}

async function ticket(room: number, i: number) {
  const sub = `load-r${room}-u${i}`;
  return new SignJWT({
    mid: `load-museum-${room}`,
    role: "VISITOR",
    name: `Visitor ${i}`,
    guest: false,
    avatar: defaultAvatar(sub),
    perms: { sharedStart: false, sharedManage: false, tour: false, voice: false, react: true },
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setAudience(TICKET_AUDIENCE)
    .setIssuer(TICKET_ISSUER)
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime("60s")
    .sign(secret);
}

interface Client {
  ws: WebSocket;
  selfId: string | null;
  probe: boolean;
  room: number;
  received: number;
  bytes: number;
}

const latencies: number[] = [];
const probeSent = new Map<string, Map<number, number>>(); // probe conn id → seq → sent at
let refused = 0;

async function connect(room: number, i: number): Promise<Client> {
  const ws = new WebSocket(`${url.replace(/\/$/, "")}/ws`, {
    headers: { origin, "x-forwarded-for": `10.${room % 250}.${Math.floor(i / 250)}.${(i % 250) + 1}` },
  });
  const client: Client = { ws, selfId: null, probe: i === 0, room, received: 0, bytes: 0 };
  await new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", reject);
    ws.once("unexpected-response", (_req, res) => reject(new Error(`HTTP ${res.statusCode}`)));
  });
  ws.send(JSON.stringify({ t: "hello", ticket: await ticket(room, i) }));
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("no welcome")), 10_000);
    ws.on("message", (raw: Buffer) => {
      client.received++;
      client.bytes += raw.length;
      const msg = JSON.parse(raw.toString()) as ServerMessage;
      if (msg.t === "welcome") {
        client.selfId = msg.self.id;
        clearTimeout(timer);
        resolve();
      } else if (msg.t === "poses") {
        const now = performance.now();
        for (const pose of msg.list) {
          const sent = probeSent.get(pose[0]);
          // The probe's x carries its sequence number.
          const at = sent?.get(Math.round(pose[1] * 100));
          if (at !== undefined) latencies.push(now - at);
        }
      }
    });
    ws.once("close", (code) => {
      refused++;
      reject(new Error(`closed ${code}`));
    });
  });
  return client;
}

function percentile(sorted: Float64Array, p: number) {
  if (!sorted.length) return NaN;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
}

async function main() {
  const clients: Client[] = [];
  const started = performance.now();
  for (let r = 0; r < rooms; r++) {
    const batch = await Promise.allSettled(Array.from({ length: perRoom }, (_, i) => connect(r, i)));
    for (const b of batch) if (b.status === "fulfilled") clients.push(b.value);
  }
  const connectSeconds = (performance.now() - started) / 1000;
  console.log(`connected ${clients.length}/${rooms * perRoom} clients in ${connectSeconds.toFixed(1)} s (refused ${refused})`);
  for (const c of clients) if (c.probe && c.selfId) probeSent.set(c.selfId, new Map());
  for (const c of clients) c.received = c.bytes = 0;

  const before = pid ? procStats(pid) : null;
  const t0 = performance.now();
  let sent = 0;
  let seq = 0;
  const timers = clients.map((c, k) =>
    setInterval(() => {
      if (c.ws.readyState !== WebSocket.OPEN) return;
      let x = Math.sin((performance.now() / 1000 + k) * 0.7) * 6;
      if (c.probe && c.selfId) {
        seq = (seq + 1) % 90_000;
        x = seq / 100; // decoded by receivers as round(x * 100)
        probeSent.get(c.selfId)!.set(seq, performance.now());
      }
      c.ws.send(JSON.stringify({ t: "pose", x, z: Math.cos(k + performance.now() / 900) * 6, yaw: 0.5, pitch: 0, speed: 1.4, running: false, room: "lobby" }));
      sent++;
    }, POSE_MS),
  );
  await new Promise((r) => setTimeout(r, seconds * 1000));
  timers.forEach(clearInterval);
  const elapsed = (performance.now() - t0) / 1000;
  const after = pid ? procStats(pid) : null;

  const sorted = Float64Array.from(latencies).sort();
  const received = clients.reduce((n, c) => n + c.received, 0);
  const bytes = clients.reduce((n, c) => n + c.bytes, 0);
  const open = clients.filter((c) => c.ws.readyState === WebSocket.OPEN).length;
  console.log(
    JSON.stringify(
      {
        rooms,
        perRoom,
        clients: clients.length,
        stillOpenAfterRun: open,
        seconds: Math.round(elapsed),
        posesSentPerSecond: Math.round(sent / elapsed),
        messagesDeliveredPerSecond: Math.round(received / elapsed),
        outboundMbitPerSecond: Number(((bytes * 8) / elapsed / 1e6).toFixed(2)),
        latencyMs: {
          samples: sorted.length,
          p50: Math.round(percentile(sorted, 50)),
          p95: Math.round(percentile(sorted, 95)),
          p99: Math.round(percentile(sorted, 99)),
          max: Math.round(sorted[sorted.length - 1] ?? NaN),
        },
        server: before && after ? { cpuPercentOfOneCore: Math.round(((after.cpuSeconds - before.cpuSeconds) / elapsed) * 100), rssMb: Math.round(after.rssMb) } : null,
      },
      null,
      2,
    ),
  );
  clients.forEach((c) => c.ws.close());
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
