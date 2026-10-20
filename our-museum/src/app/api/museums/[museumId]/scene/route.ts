import { apiHandler, json } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/auth/session";
import { getScene } from "@/services/scene-service";

type Params = { museumId: string };

/** Full scene for the 3D client, with fresh signed photo URLs. */
export const GET = apiHandler<Params>(async (req, { museumId }) => {
  const user = await requireApiUser(req.headers);
  return json(await getScene(user, museumId));
});
