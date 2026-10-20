import { apiHandler, json } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/auth/session";
import { acceptInvitationById } from "@/services/invitation-service";

type Params = { invitationId: string };

/** Accepts an invitation addressed to the signed-in user's verified email. */
export const POST = apiHandler<Params>(
  async (req, { invitationId }) => {
    const user = await requireApiUser(req.headers);
    return json(await acceptInvitationById(user, invitationId));
  },
  { rate: "invitationRedeem" },
);
