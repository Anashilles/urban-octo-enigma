import { apiHandler, json, limit, parseJson } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/auth/session";
import { createMuseumSchema } from "@/lib/validation/museum";
import { getLocale } from "@/i18n/server";
import { createMuseum, getDashboard } from "@/services/museum-service";

/** Dashboard data for the signed-in user. */
export const GET = apiHandler(async (req) => {
  const user = await requireApiUser(req.headers);
  return json(await getDashboard(user));
});

export const POST = apiHandler(async (req) => {
  const user = await requireApiUser(req.headers);
  limit(user.id, "mutation");
  const input = await parseJson(req, createMuseumSchema);
  const museum = await createMuseum(user, input, await getLocale());
  return json({ id: museum.id }, 201);
});
