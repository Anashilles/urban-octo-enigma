import { apiHandler, json } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/auth/session";
import { cancelUpload } from "@/services/photo-service";

type Params = { uploadId: string };

export const DELETE = apiHandler<Params>(async (req, { uploadId }) => {
  const user = await requireApiUser(req.headers);
  await cancelUpload(user.id, uploadId);
  return json({ ok: true });
});
