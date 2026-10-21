import { apiHandler, json, limit } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/auth/session";
import { errors } from "@/lib/errors";
import { MAX_NARRATION_BYTES } from "@/lib/validation/narration";
import { requireMuseumAccess } from "@/services/access";
import { deleteNarration, saveNarration } from "@/services/narration-service";

type Params = { museumId: string; tourId: string; frameId: string };

/** Reads the request body, stopping as soon as it passes the size limit. */
async function readCapped(req: Request, max: number) {
  if (Number(req.headers.get("content-length") ?? "0") > max) throw errors.tooLarge("This recording is too large.");
  if (!req.body) throw errors.badRequest("Empty recording");
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = req.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      throw errors.tooLarge("This recording is too large.");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/** Uploads (or replaces) the narration for one stop. The body is the raw audio recording. */
export const PUT = apiHandler<Params>(async (req, { museumId, tourId, frameId }) => {
  const user = await requireApiUser(req.headers);
  limit(user.id, "upload");
  // Refuse before reading the body; saveNarration checks again.
  await requireMuseumAccess(user.id, museumId, "tour.manage");
  const durationMs = Number(req.headers.get("x-duration-ms"));
  const bytes = await readCapped(req, MAX_NARRATION_BYTES);
  return json({ narration: await saveNarration(user.id, museumId, tourId, frameId, bytes, durationMs) });
});

export const DELETE = apiHandler<Params>(async (req, { museumId, tourId, frameId }) => {
  const user = await requireApiUser(req.headers);
  await deleteNarration(user.id, museumId, tourId, frameId);
  return json({ ok: true });
});
