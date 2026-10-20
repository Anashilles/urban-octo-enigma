import { apiHandler, json } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/auth/session";
import { leaveMuseum } from "@/services/membership-service";

type Params = { museumId: string };

export const POST = apiHandler<Params>(async (req, { museumId }) => {
  const user = await requireApiUser(req.headers);
  await leaveMuseum(user.id, museumId);
  return json({ ok: true });
});
