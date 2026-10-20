import { apiHandler, json } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/auth/session";
import { iceServersFor } from "@/services/ice-service";

/** STUN/TURN configuration for voice chat (TURN credentials are short-lived). */
export const GET = apiHandler(
  async (req) => {
    const user = await requireApiUser(req.headers);
    return json(iceServersFor(user.id));
  },
  { rate: "realtimeTicket" },
);
