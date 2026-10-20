import { z } from "zod";
import { avatarConfigSchema } from "@/features/avatars/config";
import { apiHandler, json, parseJson } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/auth/session";
import { getAvatar, saveAvatar } from "@/services/avatar-service";

export const GET = apiHandler(async (req) => {
  const user = await requireApiUser(req.headers);
  return json(await getAvatar(user.id));
});

export const PUT = apiHandler(async (req) => {
  const user = await requireApiUser(req.headers);
  const { config } = await parseJson(req, z.object({ config: avatarConfigSchema }));
  return json(await saveAvatar(user.id, config));
});
