import { describe, expect, it } from "vitest";
import { defaultAvatar } from "@/features/avatars/config";
import { clientMessageSchema, type ServerMessage, type TicketClaims } from "@/features/realtime/protocol";
import { Hub } from "../../realtime/hub";

type Perms = TicketClaims["perms"];
const ALL: Perms = { sharedStart: true, sharedManage: false, voice: true, react: true, tour: true };

function client(hub: Hub, user: string, opts: { museum?: string; role?: TicketClaims["role"]; perms?: Partial<Perms> } = {}) {
  const inbox: ServerMessage[] = [];
  const closed: Array<[number, string]> = [];
  const claims: TicketClaims = {
    sub: user,
    mid: opts.museum ?? "museum-1",
    role: opts.role ?? "VISITOR",
    name: user,
    guest: false,
    avatar: defaultAvatar(user),
    perms: { ...ALL, ...opts.perms },
  };
  const conn = Hub.createConn(claims, { send: (m) => inbox.push(m), close: (c, r) => closed.push([c, r]) });
  const result = hub.join(conn);
  const of = <T extends ServerMessage["t"]>(t: T) => inbox.filter((m): m is Extract<ServerMessage, { t: T }> => m.t === t);
  return { conn, inbox, closed, result, of, send: (raw: unknown) => hub.handle(conn, clientMessageSchema.parse(raw)) };
}

const newHub = (maxPerRoom = 10, maxPerUser = 2) => new Hub({ maxPerRoom, maxPerUser, now: () => 1000 });

describe("realtime hub", () => {
  it("welcomes with existing peers and announces joins and leaves", () => {
    const hub = newHub();
    const a = client(hub, "alice");
    const b = client(hub, "bob");
    expect(a.of("welcome")[0]?.peers).toEqual([]);
    expect(b.of("welcome")[0]?.peers.map((p) => p.userId)).toEqual(["alice"]);
    expect(a.of("peer.join")[0]?.peer.userId).toBe("bob");
    hub.leave(b.conn);
    expect(a.of("peer.leave")[0]?.id).toBe(b.conn.id);
    expect(hub.stats()).toEqual({ rooms: 1, connections: 1 });
    hub.leave(a.conn);
    expect(hub.stats()).toEqual({ rooms: 0, connections: 0 });
  });

  it("keeps museums isolated", () => {
    const hub = newHub();
    const a = client(hub, "alice", { museum: "museum-1" });
    const b = client(hub, "bob", { museum: "museum-2" });
    b.send({ t: "gesture", g: "wave" });
    b.send({ t: "pose", x: 1, z: 2, yaw: 0, pitch: 0, speed: 1, running: false, room: null });
    hub.tick();
    expect(a.of("gesture")).toEqual([]);
    expect(a.of("poses")).toEqual([]);
    expect(a.of("peer.join")).toEqual([]);
  });

  it("batches poses per tick and sends the latest pose to newcomers", () => {
    const hub = newHub();
    const a = client(hub, "alice");
    const b = client(hub, "bob");
    b.send({ t: "pose", x: 1, z: 2, yaw: 0.5, pitch: 0, speed: 1.4, running: false, room: "r1" });
    b.send({ t: "pose", x: 1.5, z: 2.25, yaw: 0.6, pitch: 0, speed: 1.4, running: true, room: "r1" });
    expect(a.of("poses")).toEqual([]);
    hub.tick();
    expect(a.of("poses")).toEqual([{ t: "poses", list: [[b.conn.id, 1.5, 2.25, 0.6, 0, 1.4, 1, "r1"]] }]);
    hub.tick();
    expect(a.of("poses")).toHaveLength(1); // nothing new
    const c = client(hub, "carol");
    expect(c.of("poses")[0]?.list.map((p) => p[0])).toEqual([b.conn.id]);
  });

  it("relays gestures, viewing and reactions to others only", () => {
    const hub = newHub();
    const a = client(hub, "alice");
    const b = client(hub, "bob");
    a.send({ t: "gesture", g: "wave" });
    a.send({ t: "viewing", photoId: "photo1" });
    a.send({ t: "react", photoId: "photo1", emoji: "❤️" });
    expect(b.of("gesture")).toEqual([{ t: "gesture", id: a.conn.id, g: "wave" }]);
    expect(b.of("peer.update")[0]).toEqual({ t: "peer.update", id: a.conn.id, patch: { viewing: "photo1" } });
    expect(b.of("react")[0]?.emoji).toBe("❤️");
    expect(a.of("gesture")).toEqual([]);
  });

  it("runs a shared viewing: start, follow, update, leave and end", () => {
    const hub = newHub();
    const a = client(hub, "alice");
    const b = client(hub, "bob");
    a.send({ t: "shared.start", photoId: "p1", sequence: ["p1", "p2"] });
    const started = b.of("shared")[0]?.state;
    expect(started).toMatchObject({ leaderId: a.conn.id, photoId: "p1", sequence: ["p1", "p2"], participants: [a.conn.id] });
    b.send({ t: "shared.join" });
    expect(hub.sharedFor("museum-1")?.participants).toEqual([a.conn.id, b.conn.id]);

    // Only the leader steers.
    b.send({ t: "shared.update", photoId: "p2" });
    expect(b.of("error").at(-1)?.code).toBe("not_leader");
    a.send({ t: "shared.update", photoId: "p1", zoom: 2.5, panX: 10, panY: -4 });
    a.send({ t: "shared.update", photoId: "p2" });
    expect(hub.sharedFor("museum-1")).toMatchObject({ photoId: "p2", zoom: 1, panX: 0 });

    // A late joiner sees the session in the welcome message.
    const c = client(hub, "carol");
    expect(c.of("welcome")[0]?.shared?.photoId).toBe("p2");

    b.send({ t: "shared.leave" });
    expect(hub.sharedFor("museum-1")?.participants).toEqual([a.conn.id]);
    b.send({ t: "shared.end" });
    expect(hub.sharedFor("museum-1")).not.toBeNull();
    a.send({ t: "shared.end" });
    expect(hub.sharedFor("museum-1")).toBeNull();
    expect(c.of("shared").at(-1)).toEqual({ t: "shared", state: null });
  });

  it("enforces shared-viewing permissions from the ticket", () => {
    const hub = newHub();
    const visitor = client(hub, "vic", { perms: { sharedStart: false } });
    visitor.send({ t: "shared.start", photoId: "p1", sequence: [] });
    expect(visitor.of("error")[0]?.code).toBe("forbidden");
    expect(hub.sharedFor("museum-1")).toBeNull();

    const a = client(hub, "alice");
    a.send({ t: "shared.start", photoId: "p1", sequence: [] });
    const b = client(hub, "bob");
    b.send({ t: "shared.start", photoId: "p9", sequence: [] });
    expect(b.of("error")[0]?.code).toBe("shared_busy");
    // The owner may take over or end someone else's session.
    const owner = client(hub, "olga", { role: "OWNER", perms: { sharedManage: true } });
    owner.send({ t: "shared.end" });
    expect(hub.sharedFor("museum-1")).toBeNull();
  });

  it("ends the session when the leader disconnects", () => {
    const hub = newHub();
    const a = client(hub, "alice");
    const b = client(hub, "bob");
    a.send({ t: "shared.start", photoId: "p1", sequence: [] });
    hub.leave(a.conn);
    expect(b.of("shared").at(-1)).toEqual({ t: "shared", state: null });
  });

  it("lets one guide lead a tour that late joiners see", () => {
    const hub = newHub();
    const guide = client(hub, "guide");
    const walker = client(hub, "walker");
    const noTours = client(hub, "vic", { perms: { tour: false } });
    noTours.send({ t: "tour.start", tourId: "tour1", index: 0 });
    expect(noTours.of("error")[0]?.code).toBe("forbidden");
    guide.send({ t: "tour.start", tourId: "tour1", index: 0 });
    expect(walker.of("tour")[0]?.state).toMatchObject({ tourId: "tour1", index: 0, leaderId: guide.conn.id, leaderName: "guide" });
    walker.send({ t: "tour.step", index: 1 });
    expect(walker.of("error").at(-1)?.code).toBe("not_leader");
    walker.send({ t: "tour.start", tourId: "tour2", index: 0 });
    expect(walker.of("error").at(-1)?.code).toBe("tour_busy");
    guide.send({ t: "tour.step", index: 2 });
    const late = client(hub, "late");
    expect(late.of("welcome")[0]?.tour).toMatchObject({ tourId: "tour1", index: 2 });
    hub.leave(guide.conn);
    expect(late.of("tour").at(-1)).toEqual({ t: "tour", state: null });
  });

  it("relays voice signals only between people with voice on", () => {
    const hub = newHub();
    const a = client(hub, "alice");
    const b = client(hub, "bob");
    const muted = client(hub, "mute", { perms: { voice: false } });
    a.send({ t: "voice.signal", to: b.conn.id, data: { type: "offer", sdp: "v=0" } });
    expect(a.of("error").at(-1)?.code).toBe("forbidden"); // alice's voice is off
    a.send({ t: "voice.state", on: true, muted: false, speaking: false });
    a.send({ t: "voice.signal", to: b.conn.id, data: { type: "offer", sdp: "v=0" } });
    expect(a.of("error").at(-1)?.code).toBe("unknown_peer"); // bob's voice is off
    b.send({ t: "voice.state", on: true, muted: true, speaking: true });
    expect(a.of("peer.update").at(-1)?.patch.voice).toEqual({ on: true, muted: true, speaking: false });
    a.send({ t: "voice.signal", to: b.conn.id, data: { type: "offer", sdp: "v=0" } });
    expect(b.of("voice.signal")).toEqual([{ t: "voice.signal", from: a.conn.id, data: { type: "offer", sdp: "v=0" } }]);
    muted.send({ t: "voice.state", on: true, muted: false, speaking: false });
    expect(muted.of("error").at(-1)?.code).toBe("forbidden");
    expect(b.of("peer.update").some((u) => u.id === muted.conn.id)).toBe(false);
  });

  it("limits room size and tabs per person", () => {
    const hub = newHub(3, 2);
    const a1 = client(hub, "alice");
    const a2 = client(hub, "alice");
    const a3 = client(hub, "alice");
    expect(a1.closed[0]?.[0]).toBe(4004); // oldest tab replaced
    expect(a1.of("kicked")[0]?.reason).toBe("replaced");
    expect([a2.result, a3.result]).toEqual(["ok", "ok"]);
    client(hub, "bob");
    expect(client(hub, "carol").result).toBe("room_full");
  });

  it("kicks removed members and broadcasts changes", () => {
    const hub = newHub();
    const a = client(hub, "alice");
    const b = client(hub, "bob");
    hub.broadcastChange("museum-1", "layout", "alice");
    expect(b.of("museum.changed")[0]).toEqual({ t: "museum.changed", scope: "layout", actorId: "alice" });
    expect(hub.kick("museum-1", "bob", "removed")).toBe(1);
    expect(b.of("kicked")[0]?.reason).toBe("removed");
    expect(a.of("peer.leave")[0]?.id).toBe(b.conn.id);
    expect(hub.kick("museum-1", null, "deleted")).toBe(1);
    expect(hub.stats().connections).toBe(0);
  });

  it("rejects malformed client messages at the schema", () => {
    expect(clientMessageSchema.safeParse({ t: "pose", x: Infinity, z: 0, yaw: 0, pitch: 0, speed: 0, running: false, room: null }).success).toBe(false);
    expect(clientMessageSchema.safeParse({ t: "shared.start", photoId: "../x", sequence: [] }).success).toBe(false);
    expect(clientMessageSchema.safeParse({ t: "react", photoId: "p", emoji: "<script>" }).success).toBe(false);
    expect(clientMessageSchema.safeParse({ t: "nope" }).success).toBe(false);
    expect(clientMessageSchema.safeParse({ t: "voice.signal", to: "x", data: { type: "offer", sdp: "a".repeat(40_000) } }).success).toBe(false);
  });
});
