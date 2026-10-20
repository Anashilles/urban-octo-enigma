import { apiHandler, json } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/auth/session";
import { acceptInvitation } from "@/services/invitation-service";

type Params = { token: string };

export const POST = apiHandler<Params>(
  async (req, { token }) => {
    const user = await requireApiUser(req.headers);
    return json(await acceptInvitation(user, token));
  },
  { rate: "invitationRedeem" },
);
