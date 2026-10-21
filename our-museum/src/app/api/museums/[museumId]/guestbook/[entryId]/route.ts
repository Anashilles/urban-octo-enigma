import { apiHandler, json } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/auth/session";
import { deleteGuestbookEntry } from "@/services/comment-service";

type Params = { museumId: string; entryId: string };

/** Authors remove their own entries; owners may remove any. */
export const DELETE = apiHandler<Params>(async (req, { museumId, entryId }) => {
  const user = await requireApiUser(req.headers);
  await deleteGuestbookEntry(user.id, museumId, entryId);
  return json({ ok: true });
});
