import { apiHandler, json, parseJson } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/auth/session";
import { orderSchema } from "@/lib/validation/photos";
import { reorderCollections } from "@/services/collection-service";

type Params = { museumId: string };

export const PUT = apiHandler<Params>(async (req, { museumId }) => {
  const user = await requireApiUser(req.headers);
  const { ids } = await parseJson(req, orderSchema);
  await reorderCollections(user.id, museumId, ids);
  return json({ ok: true });
});
