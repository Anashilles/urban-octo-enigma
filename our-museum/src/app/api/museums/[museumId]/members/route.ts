import { apiHandler, json } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/auth/session";
import { listMembers } from "@/services/membership-service";

type Params = { museumId: string };

export const GET = apiHandler<Params>(async (req, { museumId }) => {
  const user = await requireApiUser(req.headers);
  return json({ members: await listMembers(user.id, museumId) });
});
