import { apiHandler, json, parseJson } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/auth/session";
import { collectionPhotosSchema } from "@/lib/validation/photos";
import { setCollectionPhotos } from "@/services/collection-service";

type Params = { museumId: string; collectionId: string };

export const PUT = apiHandler<Params>(async (req, { museumId, collectionId }) => {
  const user = await requireApiUser(req.headers);
  const { photoIds } = await parseJson(req, collectionPhotosSchema);
  await setCollectionPhotos(user.id, museumId, collectionId, photoIds);
  return json({ ok: true });
});
