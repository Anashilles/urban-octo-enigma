import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/database/prisma";
import { errors } from "@/lib/errors";
import { buildTemplateRooms, type RoomKey } from "@/features/museums/templates";
import { privacySchema, resolvePrivacy, themeOverridesSchema } from "@/features/museums/theme";
import type { Locale } from "@/i18n/config";
import { translatorFor } from "@/i18n/server";
import type { z } from "zod";
import type { createMuseumSchema, updateMuseumSchema } from "@/lib/validation/museum";
import { requireMuseumAccess } from "./access";
import { recordEvent } from "./audit-service";
import { kickFromMuseum, notifyMuseumChanged } from "./realtime-notify";
import { syncWalls } from "./room-service";
import { kickDeletionQueue, queueStorageDeletion, storage, SIGNED_URL_TTL_SECONDS } from "./storage";

const DEFAULT_COLLECTIONS = ["ourStory", "favorites", "places", "family", "celebrations", "dreams"] as const;

/** Creates a museum from a template: owner membership, rooms, walls and starter collections in one transaction. */
export async function createMuseum(
  user: { id: string; isAnonymous: boolean },
  input: z.infer<typeof createMuseumSchema>,
  locale: Locale,
) {
  if (user.isAnonymous) throw errors.forbidden("Create an account to keep a museum of your own.");
  const owned = await prisma.museum.count({ where: { ownerId: user.id } });
  if (owned >= 25) throw errors.conflict("You have reached the maximum number of museums.");
  const t = translatorFor(locale);
  const museum = await prisma.$transaction(async (tx) => {
    const museum = await tx.museum.create({
      data: {
        ownerId: user.id,
        name: input.name,
        description: input.description,
        templateId: input.templateId,
        theme: {},
        privacy: privacySchema.parse({}),
      },
    });
    await tx.museumMembership.create({ data: { museumId: museum.id, userId: user.id, role: "OWNER" } });
    const rooms = buildTemplateRooms(
      input.templateId,
      (key: RoomKey) => t(`templates.rooms.${key}`),
      () => crypto.randomUUID().replace(/-/g, "").slice(0, 24),
    );
    for (const room of rooms) {
      await tx.museumRoom.create({
        data: {
          id: room.id,
          museumId: museum.id,
          name: room.name,
          roomType: room.roomType,
          width: room.width,
          depth: room.depth,
          height: room.height,
          positionX: room.positionX,
          positionZ: room.positionZ,
          rotation: room.rotation,
          layout: room.layout as Prisma.InputJsonValue,
          sortOrder: room.sortOrder,
        },
      });
      await syncWalls(tx, room);
    }
    await tx.photoCollection.createMany({
      data: DEFAULT_COLLECTIONS.map((key, i) => ({ museumId: museum.id, name: t(`templates.collections.${key}`), sortOrder: i })),
    });
    await tx.museumVisit.create({ data: { userId: user.id, museumId: museum.id } });
    await recordEvent({ museumId: museum.id, actorId: user.id, eventType: "museum.created", entityId: museum.id, metadata: { templateId: input.templateId } }, tx);
    return museum;
  });
  return museum;
}

export interface MuseumCard {
  id: string;
  name: string;
  description: string;
  templateId: string;
  ownerName: string;
  role: "OWNER" | "EDITOR" | "VISITOR";
  photoCount: number;
  memberCount: number;
  lastVisitedAt: string | null;
  updatedAt: string;
  coverUrl: string | null;
  coverColor: string | null;
}

/** Everything the dashboard shows, scoped to the signed-in user. */
export async function getDashboard(user: { id: string; email: string; isAnonymous: boolean }) {
  const memberships = await prisma.museumMembership.findMany({
    where: { userId: user.id },
    include: {
      museum: {
        include: {
          owner: { select: { displayName: true } },
          coverPhoto: { select: { thumbnailKey: true, dominantColor: true } },
          _count: { select: { photos: true, memberships: true } },
          photos: { take: 1, orderBy: { createdAt: "desc" }, select: { thumbnailKey: true, dominantColor: true } },
          visits: { where: { userId: user.id }, select: { lastVisitedAt: true } },
        },
      },
    },
    orderBy: { joinedAt: "desc" },
  });

  const cards: MuseumCard[] = await Promise.all(
    memberships.map(async ({ museum, role }) => {
      const cover = museum.coverPhoto ?? museum.photos[0] ?? null;
      return {
        id: museum.id,
        name: museum.name,
        description: museum.description,
        templateId: museum.templateId,
        ownerName: museum.owner.displayName,
        role,
        photoCount: museum._count.photos,
        memberCount: museum._count.memberships,
        lastVisitedAt: museum.visits[0]?.lastVisitedAt.toISOString() ?? null,
        updatedAt: museum.updatedAt.toISOString(),
        coverUrl: cover ? await storage().signedGetUrl(cover.thumbnailKey, { expiresInSeconds: SIGNED_URL_TTL_SECONDS }) : null,
        coverColor: cover?.dominantColor ?? null,
      };
    }),
  );

  const recent = [...cards]
    .filter((c) => c.lastVisitedAt)
    .sort((a, b) => (b.lastVisitedAt ?? "").localeCompare(a.lastVisitedAt ?? ""))
    .slice(0, 4);

  // Invitations addressed to this user's email that they have not used yet.
  const pending = user.isAnonymous
    ? []
    : await prisma.museumInvitation.findMany({
        where: {
          invitedEmail: { equals: user.email, mode: "insensitive" },
          revokedAt: null,
          expiresAt: { gt: new Date() },
          museum: { memberships: { none: { userId: user.id } } },
        },
        include: { museum: { select: { name: true, owner: { select: { displayName: true } } } } },
        orderBy: { createdAt: "desc" },
        take: 20,
      });

  return {
    owned: cards.filter((c) => c.role === "OWNER"),
    shared: cards.filter((c) => c.role !== "OWNER"),
    recent,
    pendingInvitations: pending
      .filter((i) => i.uses < i.maxUses)
      .map((i) => ({
        id: i.id,
        museumName: i.museum.name,
        ownerName: i.museum.owner.displayName,
        role: i.role,
        expiresAt: i.expiresAt.toISOString(),
      })),
  };
}

export async function updateMuseum(userId: string, museumId: string, patch: z.infer<typeof updateMuseumSchema>) {
  const access = await requireMuseumAccess(userId, museumId, "museum.editSettings");
  if (patch.privacy && access.role !== "OWNER") throw errors.forbidden("Only the owner can change privacy settings.");
  if (patch.coverPhotoId) {
    const photo = await prisma.photo.findFirst({ where: { id: patch.coverPhotoId, museumId }, select: { id: true } });
    if (!photo) throw errors.validation("Cover photo must belong to this museum");
  }
  const theme = patch.theme ? themeOverridesSchema.parse({ ...(access.museum.theme as object), ...patch.theme }) : undefined;
  const privacy = patch.privacy ? privacySchema.parse({ ...resolvePrivacy(access.museum.privacy), ...patch.privacy }) : undefined;
  const updated = await prisma.$transaction(async (tx) => {
    const m = await tx.museum.update({
      where: { id: museumId },
      data: {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(theme ? { theme, layoutVersion: { increment: 1 } } : {}),
        ...(privacy ? { privacy } : {}),
        ...(patch.coverPhotoId !== undefined ? { coverPhotoId: patch.coverPhotoId } : {}),
      },
    });
    await recordEvent(
      { museumId, actorId: userId, eventType: "museum.updated", entityId: museumId, metadata: { fields: Object.keys(patch) } },
      tx,
    );
    return m;
  });
  notifyMuseumChanged(museumId, "museum", userId);
  return updated;
}

/** Collects every storage key that belongs to a museum (photos and pending uploads). */
async function museumStorageKeys(museumId: string) {
  const [photos, uploads] = await Promise.all([
    prisma.photo.findMany({ where: { museumId }, select: { storageKey: true, largeKey: true, mediumKey: true, thumbnailKey: true } }),
    prisma.pendingUpload.findMany({ where: { museumId }, select: { incomingKey: true } }),
  ]);
  return [
    ...photos.flatMap((p) => [p.storageKey, p.largeKey, p.mediumKey, p.thumbnailKey]),
    ...uploads.map((u) => u.incomingKey),
  ];
}

async function deleteMuseumInternal(museumId: string, actorId: string | null) {
  const keys = await museumStorageKeys(museumId);
  await prisma.$transaction(async (tx) => {
    // Queue file deletion in the same transaction as the row deletion.
    await queueStorageDeletion(keys, `museum:${museumId}`, tx);
    await tx.museum.delete({ where: { id: museumId } });
    await recordEvent({ museumId: null, actorId, eventType: "museum.deleted", entityId: museumId, metadata: { files: keys.length } }, tx);
  });
  kickFromMuseum(museumId, null, "deleted");
}

export async function deleteMuseum(userId: string, museumId: string) {
  await requireMuseumAccess(userId, museumId, "museum.delete");
  await deleteMuseumInternal(museumId, userId);
  kickDeletionQueue();
}

/** Used by account deletion: removes every museum the user owns. */
export async function deleteAllMuseumsOwnedBy(userId: string) {
  const owned = await prisma.museum.findMany({ where: { ownerId: userId }, select: { id: true } });
  for (const m of owned) await deleteMuseumInternal(m.id, null);
  kickDeletionQueue();
}

export async function recordVisit(userId: string, museumId: string) {
  await prisma.museumVisit.upsert({
    where: { userId_museumId: { userId, museumId } },
    create: { userId, museumId },
    update: { lastVisitedAt: new Date(), visitCount: { increment: 1 } },
  });
}
