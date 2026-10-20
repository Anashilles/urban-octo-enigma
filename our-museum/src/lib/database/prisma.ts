import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * A single PrismaClient per process. In development Next.js hot-reloads modules,
 * so the instance is cached on globalThis to avoid exhausting connections.
 *
 * Deliberately free of `server-only` so the realtime service and scripts can
 * reuse it; nothing in the browser bundle may import this module.
 */
const globalForPrisma = globalThis as unknown as { __ourMuseumPrisma?: PrismaClient };

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const adapter = new PrismaPg({
    connectionString,
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
  });
  return new PrismaClient({ adapter });
}

export const prisma: PrismaClient = globalForPrisma.__ourMuseumPrisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.__ourMuseumPrisma = prisma;

export type Db = PrismaClient;
/** The client type available inside `prisma.$transaction(async (tx) => …)`. */
export type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
