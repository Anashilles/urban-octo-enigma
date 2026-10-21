import { apiHandler, json } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/auth/session";
import { deleteComment } from "@/services/comment-service";

type Params = { museumId: string; commentId: string };

/** Authors remove their own comments; owners may remove any. */
export const DELETE = apiHandler<Params>(async (req, { museumId, commentId }) => {
  const user = await requireApiUser(req.headers);
  await deleteComment(user.id, museumId, commentId);
  return json({ ok: true });
});
