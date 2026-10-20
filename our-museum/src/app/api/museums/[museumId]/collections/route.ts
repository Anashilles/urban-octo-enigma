import { apiHandler, json, parseJson } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/auth/session";
import { collectionSchema } from "@/lib/validation/photos";
import { createCollection } from "@/services/collection-service";

type Params = { museumId: string };

export const POST = apiHandler<Params>(async (req, { museumId }) => {
  const user = await requireApiUser(req.headers);
  const c = await createCollection(user.id, museumId, await parseJson(req, collectionSchema));
  return json({ id: c.id }, 201);
});
