import { apiHandler, json, parseJson } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/auth/session";
import { collectionSchema } from "@/lib/validation/photos";
import { deleteCollection, updateCollection } from "@/services/collection-service";

type Params = { museumId: string; collectionId: string };

export const PATCH = apiHandler<Params>(async (req, { museumId, collectionId }) => {
  const user = await requireApiUser(req.headers);
  await updateCollection(user.id, museumId, collectionId, await parseJson(req, collectionSchema));
  return json({ ok: true });
});

export const DELETE = apiHandler<Params>(async (req, { museumId, collectionId }) => {
  const user = await requireApiUser(req.headers);
  await deleteCollection(user.id, museumId, collectionId);
  return json({ ok: true });
});
