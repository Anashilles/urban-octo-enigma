import { apiHandler, json, parseJson } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/auth/session";
import { reorderRoomsSchema } from "@/lib/validation/museum";
import { reorderRooms } from "@/services/room-service";

type Params = { museumId: string };

export const PUT = apiHandler<Params>(async (req, { museumId }) => {
  const user = await requireApiUser(req.headers);
  const { roomIds } = await parseJson(req, reorderRoomsSchema);
  await reorderRooms(user.id, museumId, roomIds);
  return json({ ok: true });
});
