import { apiHandler, json } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/auth/session";
import { issueRealtimeTicket } from "@/services/realtime-service";

type Params = { museumId: string };

/** A single-use ticket for connecting to the realtime service (valid 60 s). */
export const POST = apiHandler<Params>(
  async (req, { museumId }) => {
    const user = await requireApiUser(req.headers);
    return json(await issueRealtimeTicket(user, museumId));
  },
  { rate: "realtimeTicket" },
);
