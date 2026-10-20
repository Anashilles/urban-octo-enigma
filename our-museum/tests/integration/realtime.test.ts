import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SignJWT } from "jose";
import WebSocket from "ws";
import { INTERNAL_AUDIENCE, type ServerMessage } from "@/features/realtime/protocol";
import { realtimeTicketSecret } from "@/lib/env";
import { createMuseum } from "@/services/museum-service";
import { issueRealtimeTicket } from "@/services/realtime-service";
import { configFromEnv, startRealtime, type RunningRealtime } from "../../realtime/server";
import { addMember, createUser, resetDatabase } from "../helpers/factories";

let rt: RunningRealtime;
const ORIGIN = "http://localhost:3000";

beforeAll(async () => {
  rt = await startRealtime({ ...configFromEnv({ ...process.env, APP_URL: ORIGIN, REALTIME_PORT: "0", LOG_LEVEL: "error" }), host: "127.0.0.1" });
});
afterAll(() => rt?.close());

interface TestSocket {
  ws: WebSocket;
  inbox: ServerMessage[];
  next: <T extends ServerMessage["t"]>(t: T, timeout?: number) => Promise<Extract<ServerMessage, { t: T }>>;
  closed: Promise<number>;
  send: (m: unknown) => void;
}

function connect(origin = ORIGIN): Promise<TestSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${rt.port}/ws`, { headers: { origin } });
    const inbox: ServerMessage[] = [];
    const waiters: Array<() => void> = [];
    ws.on("message", (raw) => {
      inbox.push(JSON.parse(raw.toString()));
      waiters.splice(0).forEach((w) => w());
    });
    const closed = new Promise<number>((r) => ws.on("close", (code) => r(code)));
    const next: TestSocket["next"] = (t, timeout = 3000) =>
      new Promise((res, rej) => {
        const started = Date.now();
        const check = () => {
          const i = inbox.findIndex((m) => m.t === t);
          if (i >= 0) return res(inbox.splice(i, 1)[0] as never);
          if (Date.now() - started > timeout) return rej(new Error(`timeout waiting for ${t}`));
          waiters.push(check);
          setTimeout(check, 50);
        };
        check();
      });
    ws.on("open", () => resolve({ ws, inbox, next, closed, send: (m) => ws.send(JSON.stringify(m)) }));
    ws.on("unexpected-response", (_req, res) => reject(new Error(`HTTP ${res.statusCode}`)));
    ws.on("error", reject);
  });
}

async function setup() {
  const owner = await createUser("Owner");
  const visitor = await createUser("Visitor");
  const museum = await createMuseum(owner, { name: "Ours", description: "", templateId: "warm-romantic" }, "en");
  await addMember(museum.id, visitor.id, "VISITOR");
  return { owner, visitor, museum };
}

async function internal(path: string, body: unknown, token?: string) {
  return fetch(`http://127.0.0.1:${rt.port}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
}

describe("realtime service", () => {
  beforeEach(resetDatabase);

  it("connects members with a ticket and syncs movement and shared viewing", async () => {
    const { owner, visitor, museum } = await setup();
    const a = await connect();
    a.send({ t: "hello", ticket: (await issueRealtimeTicket(owner, museum.id)).ticket });
    const welcomeA = await a.next("welcome");
    expect(welcomeA.self).toMatchObject({ userId: owner.id, role: "OWNER" });

    const b = await connect();
    b.send({ t: "hello", ticket: (await issueRealtimeTicket(visitor, museum.id)).ticket });
    const welcomeB = await b.next("welcome");
    expect(welcomeB.peers.map((p) => p.userId)).toEqual([owner.id]);
    expect((await a.next("peer.join")).peer.userId).toBe(visitor.id);

    a.send({ t: "pose", x: 2, z: -3, yaw: 1, pitch: 0, speed: 2, running: false, room: null });
    const poses = await b.next("poses");
    expect(poses.list[0]?.slice(0, 3)).toEqual([welcomeA.self.id, 2, -3]);

    a.send({ t: "shared.start", photoId: "photo1", sequence: ["photo1", "photo2"] });
    expect((await b.next("shared")).state?.photoId).toBe("photo1");
    a.send({ t: "shared.update", photoId: "photo2" });
    expect((await b.next("shared")).state?.photoId).toBe("photo2");

    b.ws.close();
    expect((await a.next("peer.leave")).id).toBe(welcomeB.self.id);
    a.ws.close();
  });

  it("refuses bad, reused and foreign tickets and other origins", async () => {
    const { owner, museum } = await setup();
    await expect(connect("https://evil.example")).rejects.toThrow("HTTP 403");

    const forged = await connect();
    forged.send({ t: "hello", ticket: await new SignJWT({ mid: museum.id }).setProtectedHeader({ alg: "HS256" }).setSubject(owner.id).sign(new TextEncoder().encode("x".repeat(40))) });
    expect(await forged.closed).toBe(4001);

    const { ticket } = await issueRealtimeTicket(owner, museum.id);
    const first = await connect();
    first.send({ t: "hello", ticket });
    await first.next("welcome");
    const replay = await connect();
    replay.send({ t: "hello", ticket });
    expect(await replay.closed).toBe(4001);
    first.ws.close();

    const silent = await connect();
    silent.send({ t: "pose", x: 0, z: 0, yaw: 0, pitch: 0, speed: 0, running: false, room: null });
    expect(await silent.closed).toBe(4001);

    // Non-members cannot even get a ticket.
    const stranger = await createUser("Stranger");
    await expect(issueRealtimeTicket(stranger, museum.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("accepts internal notifications only with a valid service token", async () => {
    const { owner, visitor, museum } = await setup();
    const v = await connect();
    v.send({ t: "hello", ticket: (await issueRealtimeTicket(visitor, museum.id)).ticket });
    await v.next("welcome");

    expect((await internal("/internal/kick", { museumId: museum.id, userId: visitor.id, reason: "removed" })).status).toBe(401);
    const wrongAudience = await new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setAudience("our-museum-realtime").setExpirationTime("60s").sign(new TextEncoder().encode(realtimeTicketSecret()));
    expect((await internal("/internal/kick", { museumId: museum.id, userId: visitor.id, reason: "removed" }, wrongAudience)).status).toBe(401);

    const token = await new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setAudience(INTERNAL_AUDIENCE).setExpirationTime("60s").sign(new TextEncoder().encode(realtimeTicketSecret()));
    expect((await internal("/internal/broadcast", { museumId: museum.id, event: { type: "museum.changed", scope: "photos", actorId: owner.id } }, token)).status).toBe(200);
    expect((await v.next("museum.changed")).scope).toBe("photos");
    const kicked = await internal("/internal/kick", { museumId: museum.id, userId: visitor.id, reason: "removed" }, token);
    expect(await kicked.json()).toMatchObject({ kicked: 1 });
    expect((await v.next("kicked")).reason).toBe("removed");
    expect(await v.closed).toBe(4004);
  });

  it("puts permissions from the membership into the ticket", async () => {
    const { owner, visitor, museum } = await setup();
    const { updateMuseum } = await import("@/services/museum-service");
    await updateMuseum(owner.id, museum.id, { privacy: { guestsCanStartSharedViewing: false, voiceChatEnabled: false } });
    const v = await connect();
    v.send({ t: "hello", ticket: (await issueRealtimeTicket(visitor, museum.id)).ticket });
    await v.next("welcome");
    v.send({ t: "shared.start", photoId: "photo1", sequence: [] });
    expect((await v.next("error")).code).toBe("forbidden");
    v.send({ t: "voice.state", on: true, muted: false, speaking: false });
    expect((await v.next("error")).code).toBe("forbidden");
    v.ws.close();
  });
});
