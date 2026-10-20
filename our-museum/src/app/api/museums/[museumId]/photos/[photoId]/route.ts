import { apiHandler, json, limit, parseJson } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/auth/session";
import { updatePhotoSchema } from "@/lib/validation/photos";
import { deletePhoto, updatePhoto } from "@/services/photo-service";

type Params = { museumId: string; photoId: string };

export const PATCH = apiHandler<Params>(async (req, { museumId, photoId }) => {
  const user = await requireApiUser(req.headers);
  limit(user.id, "mutation");
  await updatePhoto(user.id, museumId, photoId, await parseJson(req, updatePhotoSchema));
  return json({ ok: true });
});

export const DELETE = apiHandler<Params>(async (req, { museumId, photoId }) => {
  const user = await requireApiUser(req.headers);
  await deletePhoto(user.id, museumId, photoId);
  return json({ ok: true });
});
