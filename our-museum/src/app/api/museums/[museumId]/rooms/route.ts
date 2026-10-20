import { apiHandler, json, limit, parseJson } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/auth/session";
import { createRoomSchema } from "@/lib/validation/museum";
import { createRoom } from "@/services/room-service";

type Params = { museumId: string };

export const POST = apiHandler<Params>(async (req, { museumId }) => {
  const user = await requireApiUser(req.headers);
  limit(user.id, "mutation");
  const input = await parseJson(req, createRoomSchema);
  const room = await createRoom(user.id, museumId, input);
  return json({ id: room.id }, 201);
});
