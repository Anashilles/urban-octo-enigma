import { apiHandler, json } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/auth/session";
import { revokeInvitation } from "@/services/invitation-service";

type Params = { museumId: string; invitationId: string };

/** Revokes an invitation; links already shared stop working immediately. */
export const DELETE = apiHandler<Params>(async (req, { museumId, invitationId }) => {
  const user = await requireApiUser(req.headers);
  return json({ invitation: await revokeInvitation(user.id, museumId, invitationId) });
});
