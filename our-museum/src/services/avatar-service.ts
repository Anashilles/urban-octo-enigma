import "server-only";
import { prisma } from "@/lib/database/prisma";
import { AVATAR_MODEL_ID, avatarConfigSchema, normalizeAvatarConfig, type AvatarConfig } from "@/features/avatars/config";

export interface AvatarState {
  config: AvatarConfig;
  /** False until the user has saved their own avatar (a seeded default is used). */
  saved: boolean;
  updatedAt: string | null;
}

export async function getAvatar(userId: string): Promise<AvatarState> {
  const profile = await prisma.avatarProfile.findUnique({ where: { userId } });
  return {
    config: normalizeAvatarConfig(profile?.config, userId),
    saved: Boolean(profile),
    updatedAt: profile?.updatedAt.toISOString() ?? null,
  };
}

/** Avatars for several users at once (presence lists, realtime join). */
export async function getAvatars(userIds: string[]): Promise<Map<string, AvatarConfig>> {
  const unique = [...new Set(userIds)];
  const rows = unique.length ? await prisma.avatarProfile.findMany({ where: { userId: { in: unique } } }) : [];
  const byUser = new Map(rows.map((r) => [r.userId, r.config]));
  return new Map(unique.map((id) => [id, normalizeAvatarConfig(byUser.get(id), id)]));
}

/** Validates strictly (unknown fields and invalid values are rejected) and saves. */
export async function saveAvatar(userId: string, input: unknown): Promise<AvatarState> {
  const config = avatarConfigSchema.parse(input);
  const profile = await prisma.avatarProfile.upsert({
    where: { userId },
    create: { userId, modelId: AVATAR_MODEL_ID, config },
    update: { modelId: AVATAR_MODEL_ID, config },
  });
  return { config, saved: true, updatedAt: profile.updatedAt.toISOString() };
}
