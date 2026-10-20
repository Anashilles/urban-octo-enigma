import { apiHandler, json, limit, parseJson } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/auth/session";
import { updateRoomSchema } from "@/lib/validation/museum";
import { deleteRoom, updateRoom } from "@/services/room-service";

type Params = { museumId: string; roomId: string };

export const PATCH = apiHandler<Params>(async (req, { museumId, roomId }) => {
  const user = await requireApiUser(req.headers);
  limit(user.id, "mutation");
  const patch = await parseJson(req, updateRoomSchema);
  return json(await updateRoom(user.id, museumId, roomId, patch));
});

/** DELETE ?confirm=1 is required when the room still has frames. */
export const DELETE = apiHandler<Params>(async (req, { museumId, roomId }) => {
  const user = await requireApiUser(req.headers);
  const confirm = new URL(req.url).searchParams.get("confirm") === "1";
  return json(await deleteRoom(user.id, museumId, roomId, { confirm }));
});
