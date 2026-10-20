import { z } from "zod";
import { REACTION_EMOJIS } from "@/features/realtime/protocol";
import { apiHandler, json, parseJson } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/auth/session";
import { toggleReaction } from "@/services/reaction-service";

type Params = { museumId: string; photoId: string };

/** Toggles one of the caller's reactions on a photograph. */
export const PUT = apiHandler<Params>(async (req, { museumId, photoId }) => {
  const user = await requireApiUser(req.headers);
  const { emoji } = await parseJson(req, z.object({ emoji: z.enum(REACTION_EMOJIS) }));
  return json(await toggleReaction(user.id, museumId, photoId, emoji));
});
