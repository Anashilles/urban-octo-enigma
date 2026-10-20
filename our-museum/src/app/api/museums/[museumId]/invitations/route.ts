import { apiHandler, json, parseJson } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/auth/session";
import { createInvitationSchema } from "@/lib/validation/invitations";
import { createInvitation, listInvitations } from "@/services/invitation-service";

type Params = { museumId: string };

export const GET = apiHandler<Params>(async (req, { museumId }) => {
  const user = await requireApiUser(req.headers);
  return json({ invitations: await listInvitations(user.id, museumId) });
});

export const POST = apiHandler<Params>(
  async (req, { museumId }) => {
    const user = await requireApiUser(req.headers);
    const input = await parseJson(req, createInvitationSchema);
    return json(await createInvitation(user, museumId, input, user.locale), 201);
  },
  { rate: "invitationCreate" },
);
