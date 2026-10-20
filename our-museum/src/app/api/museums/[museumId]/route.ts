import { apiHandler, json, limit, parseJson } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/auth/session";
import { updateMuseumSchema } from "@/lib/validation/museum";
import { requireMuseumAccess } from "@/services/access";
import { deleteMuseum, updateMuseum } from "@/services/museum-service";

type Params = { museumId: string };

export const GET = apiHandler<Params>(async (req, { museumId }) => {
  const user = await requireApiUser(req.headers);
  const { museum, role } = await requireMuseumAccess(user.id, museumId);
  return json({
    id: museum.id,
    name: museum.name,
    description: museum.description,
    templateId: museum.templateId,
    theme: museum.theme,
    privacy: museum.privacy,
    coverPhotoId: museum.coverPhotoId,
    layoutVersion: museum.layoutVersion,
    role,
  });
});

export const PATCH = apiHandler<Params>(async (req, { museumId }) => {
  const user = await requireApiUser(req.headers);
  limit(user.id, "mutation");
  const patch = await parseJson(req, updateMuseumSchema);
  const museum = await updateMuseum(user.id, museumId, patch);
  return json({ id: museum.id, layoutVersion: museum.layoutVersion, updatedAt: museum.updatedAt.toISOString() });
});

export const DELETE = apiHandler<Params>(async (req, { museumId }) => {
  const user = await requireApiUser(req.headers);
  await deleteMuseum(user.id, museumId);
  return json({ ok: true });
});
