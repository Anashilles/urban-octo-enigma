import { apiHandler, json, limit, parseJson } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/auth/session";
import { commentSchema } from "@/lib/validation/comments";
import { addComment, listComments } from "@/services/comment-service";

type Params = { museumId: string; photoId: string };

/** Comments on a photograph, oldest first. */
export const GET = apiHandler<Params>(async (req, { museumId, photoId }) => {
  const user = await requireApiUser(req.headers);
  return json(await listComments(user.id, museumId, photoId));
});

export const POST = apiHandler<Params>(async (req, { museumId, photoId }) => {
  const user = await requireApiUser(req.headers);
  limit(user.id, "comment");
  return json(await addComment(user.id, museumId, photoId, await parseJson(req, commentSchema)), 201);
});
