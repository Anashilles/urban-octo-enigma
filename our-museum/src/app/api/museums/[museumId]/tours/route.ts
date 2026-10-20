import { apiHandler, json, parseJson } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/auth/session";
import { tourSchema } from "@/lib/validation/tours";
import { saveTour } from "@/services/tour-service";

type Params = { museumId: string };

export const POST = apiHandler<Params>(async (req, { museumId }) => {
  const user = await requireApiUser(req.headers);
  const input = await parseJson(req, tourSchema);
  return json({ tour: await saveTour(user.id, museumId, input) }, 201);
});
