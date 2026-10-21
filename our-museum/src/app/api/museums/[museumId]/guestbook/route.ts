import { apiHandler, json, limit, parseJson } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/auth/session";
import { guestbookSchema } from "@/lib/validation/comments";
import { listGuestbook, signGuestbook } from "@/services/comment-service";

type Params = { museumId: string };

/** The museum's guestbook, newest first. */
export const GET = apiHandler<Params>(async (req, { museumId }) => {
  const user = await requireApiUser(req.headers);
  return json(await listGuestbook(user.id, museumId));
});

export const POST = apiHandler<Params>(async (req, { museumId }) => {
  const user = await requireApiUser(req.headers);
  limit(user.id, "comment");
  return json(await signGuestbook(user.id, museumId, await parseJson(req, guestbookSchema)), 201);
});
