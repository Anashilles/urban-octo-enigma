import { z } from "zod";
import { apiHandler, json, parseJson } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/auth/session";
import { setFavorite } from "@/services/photo-service";

type Params = { museumId: string; photoId: string };

export const PUT = apiHandler<Params>(async (req, { museumId, photoId }) => {
  const user = await requireApiUser(req.headers);
  const { favorite } = await parseJson(req, z.object({ favorite: z.boolean() }));
  await setFavorite(user.id, museumId, photoId, favorite);
  return json({ ok: true });
});
