import "server-only";
import { resolvePrivacy } from "@/features/museums/theme";
import type { ReactionEmoji } from "@/features/realtime/protocol";
import { prisma } from "@/lib/database/prisma";
import { errors } from "@/lib/errors";
import { requireMuseumAccess } from "./access";

/** Adds or removes the caller's reaction on a photograph and returns the new totals. */
export async function toggleReaction(userId: string, museumId: string, photoId: string, emoji: ReactionEmoji) {
  const { museum } = await requireMuseumAccess(userId, museumId, "photo.react");
  if (!resolvePrivacy(museum.privacy).reactionsEnabled) throw errors.forbidden("Reactions are turned off in this museum.");
  const photo = await prisma.photo.findFirst({ where: { id: photoId, museumId }, select: { id: true } });
  if (!photo) throw errors.notFound("Photo not found");

  const where = { photoId_userId_emoji: { photoId, userId, emoji } };
  const existing = await prisma.photoReaction.findUnique({ where });
  if (existing) await prisma.photoReaction.delete({ where });
  else await prisma.photoReaction.upsert({ where, create: { photoId, userId, emoji }, update: {} });

  const rows = await prisma.photoReaction.groupBy({ by: ["emoji"], where: { photoId }, _count: { _all: true } });
  const mine = await prisma.photoReaction.findMany({ where: { photoId, userId }, select: { emoji: true } });
  return {
    added: !existing,
    reactions: Object.fromEntries(rows.map((r) => [r.emoji, r._count._all])) as Record<string, number>,
    myReactions: mine.map((m) => m.emoji),
  };
}
