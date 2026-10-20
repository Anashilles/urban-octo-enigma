import { apiHandler, json } from "@/lib/api/handler";
import { prisma } from "@/lib/database/prisma";

/** Public liveness probe. Detailed diagnostics are admin-only (/api/admin/diagnostics). */
export const GET = apiHandler(async () => {
  let db = "ok";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    db = "unavailable";
  }
  return json({ status: db === "ok" ? "ok" : "degraded", time: new Date().toISOString() }, db === "ok" ? 200 : 503);
});
