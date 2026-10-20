import { apiHandler, json } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/auth/session";
import { errors } from "@/lib/errors";
import { getDiagnostics } from "@/services/admin-service";

/** Admin-only (ADMIN_EMAILS). Others get 404 so the endpoint isn't advertised. */
export const GET = apiHandler(async (req) => {
  const user = await requireApiUser(req.headers);
  if (!user.isAdmin) throw errors.notFound();
  return json(await getDiagnostics());
});
