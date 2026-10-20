import { apiHandler, json } from "@/lib/api/handler";
import { errors } from "@/lib/errors";
import { previewInvitation } from "@/services/invitation-service";

type Params = { token: string };

/** Public: what an invitation link leads to (museum name, inviter, role, status). */
export const GET = apiHandler<Params>(
  async (_req, { token }) => {
    const preview = await previewInvitation(token);
    if (!preview) throw errors.notFound("This invitation link is not valid.");
    return json(preview);
  },
  { rate: "invitationRedeem" },
);
