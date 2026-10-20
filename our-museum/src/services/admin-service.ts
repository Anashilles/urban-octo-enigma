import "server-only";
import { env } from "@/lib/env";
import { prisma } from "@/lib/database/prisma";
import { apiLimiter } from "@/lib/rate-limit";
import { cleanupAbandonedUploads } from "./photo-service";
import { processDeletionQueue, storage } from "./storage";

async function timed<T>(fn: () => Promise<T>): Promise<{ ok: boolean; ms: number; value?: T; detail?: string }> {
  const started = performance.now();
  try {
    const value = await fn();
    return { ok: true, ms: Math.round(performance.now() - started), value };
  } catch (e) {
    return { ok: false, ms: Math.round(performance.now() - started), detail: e instanceof Error ? e.message.slice(0, 200) : "unavailable" };
  }
}

/**
 * Operational overview for administrators. Contains counts and configuration
 * flags only — never secrets, tokens, email addresses or photo contents.
 */
export async function getDiagnostics() {
  const e = env();
  const [database, storageCheck, realtime, counts, recentEvents] = await Promise.all([
    timed(() => prisma.$queryRaw`SELECT 1`),
    timed(() => storage().check()),
    timed(async () => {
      const res = await fetch(`${e.REALTIME_INTERNAL_URL.replace(/\/$/, "")}/health`, { signal: AbortSignal.timeout(1500) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as { rooms: number; connections: number };
    }),
    Promise.all([
      prisma.user.count({ where: { isAnonymous: false } }),
      prisma.user.count({ where: { isAnonymous: true } }),
      prisma.museum.count(),
      prisma.photo.count(),
      prisma.photoFrame.count(),
      prisma.museumInvitation.count({ where: { revokedAt: null, expiresAt: { gt: new Date() } } }),
      prisma.pendingUpload.count({ where: { status: { in: ["PENDING", "PROCESSING"] } } }),
      prisma.storageDeletion.count(),
      prisma.guidedTour.count(),
      prisma.session.count({ where: { expiresAt: { gt: new Date() } } }),
    ]),
    prisma.museumEvent.findMany({ orderBy: { createdAt: "desc" }, take: 15, select: { eventType: true, createdAt: true, museumId: true } }),
  ]);
  const [users, guests, museums, photos, frames, activeInvitations, pendingUploads, queuedDeletions, tours, activeSessions] = counts;
  return {
    generatedAt: new Date().toISOString(),
    checks: {
      database: { ok: database.ok, ms: database.ms, detail: database.detail ?? null },
      storage: { ok: storageCheck.ok && Boolean(storageCheck.value?.ok), ms: storageCheck.ms, detail: storageCheck.value?.detail ?? storageCheck.detail ?? null },
      realtime: { ok: realtime.ok, ms: realtime.ms, detail: realtime.detail ?? null, rooms: realtime.value?.rooms ?? null, connections: realtime.value?.connections ?? null },
    },
    counts: { users, guests, museums, photos, frames, activeInvitations, pendingUploads, queuedDeletions, tours, activeSessions },
    config: {
      storageDriver: e.STORAGE_DRIVER,
      emailDriver: e.EMAIL_DRIVER,
      emailVerificationRequired: e.AUTH_REQUIRE_EMAIL_VERIFICATION,
      stunServers: e.STUN_URLS.length,
      turnRelay: Boolean(e.TURN_URLS.length && e.TURN_SHARED_SECRET),
      cronSecretSet: Boolean(e.CRON_SECRET),
      uploadMaxBytes: e.UPLOAD_MAX_BYTES,
      realtimeUrl: e.REALTIME_PUBLIC_URL,
    },
    rateLimits: apiLimiter.stats(),
    process: {
      node: process.version,
      uptimeSeconds: Math.round(process.uptime()),
      rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    },
    recentEvents: recentEvents.map((r) => ({ type: r.eventType, at: r.createdAt.toISOString(), museumId: r.museumId })),
  };
}
export type Diagnostics = Awaited<ReturnType<typeof getDiagnostics>>;

export async function runMaintenance() {
  const abandoned = await cleanupAbandonedUploads();
  const deletions = await processDeletionQueue(500);
  return { abandoned, ...deletions };
}
