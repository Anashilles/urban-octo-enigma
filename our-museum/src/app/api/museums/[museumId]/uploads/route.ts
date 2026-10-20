import { apiHandler, json, limit, parseJson } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/auth/session";
import { createUploadSchema } from "@/lib/validation/photos";
import { createUpload } from "@/services/photo-service";

type Params = { museumId: string };

/** Reserves an upload slot and returns a short-lived direct upload URL. */
export const POST = apiHandler<Params>(async (req, { museumId }) => {
  const user = await requireApiUser(req.headers);
  limit(user.id, "upload");
  const input = await parseJson(req, createUploadSchema);
  return json(await createUpload(user.id, museumId, input), 201);
});
