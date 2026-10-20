import { apiHandler, json, limit, parseJson } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/auth/session";
import { placeFrameSchema } from "@/lib/validation/photos";
import { frameToResponse, placeFrame } from "@/services/photo-placement-service";

type Params = { museumId: string };

/** Hangs a photo on a wall. The server validates bounds, doorways and overlaps. */
export const POST = apiHandler<Params>(async (req, { museumId }) => {
  const user = await requireApiUser(req.headers);
  limit(user.id, "mutation");
  const frame = await placeFrame(user.id, museumId, await parseJson(req, placeFrameSchema));
  return json(frameToResponse(frame), 201);
});
