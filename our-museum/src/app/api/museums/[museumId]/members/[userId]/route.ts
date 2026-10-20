import { z } from "zod";
import { apiHandler, json, parseJson } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/auth/session";
import { changeMemberRole, removeMember } from "@/services/membership-service";

type Params = { museumId: string; userId: string };

export const PATCH = apiHandler<Params>(async (req, { museumId, userId }) => {
  const user = await requireApiUser(req.headers);
  const { role } = await parseJson(req, z.object({ role: z.enum(["EDITOR", "VISITOR"]) }));
  await changeMemberRole(user.id, museumId, userId, role);
  return json({ ok: true });
});

export const DELETE = apiHandler<Params>(async (req, { museumId, userId }) => {
  const user = await requireApiUser(req.headers);
  await removeMember(user.id, museumId, userId);
  return json({ ok: true });
});
