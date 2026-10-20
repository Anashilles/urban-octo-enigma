import { apiHandler, json, parseJson } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/auth/session";
import { completeUploadSchema } from "@/lib/validation/photos";
import { completeUpload } from "@/services/photo-service";

type Params = { uploadId: string };

/** Verifies and processes the uploaded file, then creates the photo. */
export const POST = apiHandler<Params>(async (req, { uploadId }) => {
  const user = await requireApiUser(req.headers);
  const meta = await parseJson(req, completeUploadSchema);
  return json(await completeUpload(user.id, uploadId, meta), 201);
});
