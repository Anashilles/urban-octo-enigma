import { apiHandler, json } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/auth/session";
import { errors } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { runMaintenance } from "@/services/admin-service";

/** Runs the cleanup job now (abandoned uploads, queued storage deletions). */
export const POST = apiHandler(async (req) => {
  const user = await requireApiUser(req.headers);
  if (!user.isAdmin) throw errors.notFound();
  const result = await runMaintenance();
  logger.info("admin_maintenance", { ...result });
  return json(result);
});
