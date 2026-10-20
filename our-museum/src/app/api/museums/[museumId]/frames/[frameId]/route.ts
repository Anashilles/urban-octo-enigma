import { apiHandler, json, limit, parseJson } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/auth/session";
import { updateFrameSchema } from "@/lib/validation/photos";
import { deleteFrame, frameToResponse, updateFrame } from "@/services/photo-placement-service";

type Params = { museumId: string; frameId: string };

export const PATCH = apiHandler<Params>(async (req, { museumId, frameId }) => {
  const user = await requireApiUser(req.headers);
  limit(user.id, "mutation");
  const frame = await updateFrame(user.id, museumId, frameId, await parseJson(req, updateFrameSchema));
  return json(frameToResponse(frame));
});

export const DELETE = apiHandler<Params>(async (req, { museumId, frameId }) => {
  const user = await requireApiUser(req.headers);
  await deleteFrame(user.id, museumId, frameId);
  return json({ ok: true });
});
