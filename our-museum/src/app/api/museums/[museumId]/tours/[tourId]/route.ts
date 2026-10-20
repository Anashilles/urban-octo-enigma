import { apiHandler, json, parseJson } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/auth/session";
import { tourSchema } from "@/lib/validation/tours";
import { deleteTour, saveTour } from "@/services/tour-service";

type Params = { museumId: string; tourId: string };

export const PUT = apiHandler<Params>(async (req, { museumId, tourId }) => {
  const user = await requireApiUser(req.headers);
  const input = await parseJson(req, tourSchema);
  return json({ tour: await saveTour(user.id, museumId, input, tourId) });
});

export const DELETE = apiHandler<Params>(async (req, { museumId, tourId }) => {
  const user = await requireApiUser(req.headers);
  await deleteTour(user.id, museumId, tourId);
  return json({ ok: true });
});
