import "server-only";
import { prisma } from "@/lib/database/prisma";
import { permissionsFor } from "@/lib/permissions";
import type { SceneData, SceneFrame, ScenePhoto, SceneRoom } from "@/features/museums/scene-types";
import { getTemplate } from "@/features/museums/templates";
import { resolvePrivacy, resolveTheme, themeOverridesSchema } from "@/features/museums/theme";
import { frameOptionsSchema, FRAME_STYLES, type FrameStyle } from "@/features/photo-placement/placement";
import { roomAt, WALL_KEYS, type WallKey } from "@/features/rooms/geometry";
import { requireMuseumAccess } from "./access";
import { recordVisit } from "./museum-service";
import { toRoomShape } from "./room-service";
import { SIGNED_URL_TTL_SECONDS, storage } from "./storage";

export async function signedPhotoUrls(p: { thumbnailKey: string; mediumKey: string; largeKey: string }) {
  const s = storage();
  const opts = { expiresInSeconds: SIGNED_URL_TTL_SECONDS };
  const [thumb, medium, large] = await Promise.all([
    s.signedGetUrl(p.thumbnailKey, opts),
    s.signedGetUrl(p.mediumKey, opts),
    s.signedGetUrl(p.largeKey, opts),
  ]);
  return { thumb, medium, large };
}

/**
 * Assembles everything the museum client needs, scoped to the caller's role.
 * Photo files are only exposed as short-lived signed URLs.
 */
export async function getScene(user: { id: string; displayName: string; isAnonymous: boolean }, museumId: string, opts: { recordVisit?: boolean } = {}): Promise<SceneData> {
  const { museum, role } = await requireMuseumAccess(user.id, museumId, "museum.view");
  const [owner, rooms, frames, photos, collections, tours, reactions] = await Promise.all([
    prisma.user.findUnique({ where: { id: museum.ownerId }, select: { displayName: true } }),
    prisma.museumRoom.findMany({ where: { museumId }, orderBy: { sortOrder: "asc" }, include: { walls: true } }),
    prisma.photoFrame.findMany({ where: { museumId }, include: { wall: { select: { wallKey: true } } }, orderBy: { createdAt: "asc" } }),
    prisma.photo.findMany({
      where: { museumId },
      orderBy: { createdAt: "asc" },
      include: {
        collections: { select: { collectionId: true } },
        favorites: { where: { userId: user.id }, select: { userId: true } },
      },
    }),
    prisma.photoCollection.findMany({
      where: { museumId },
      orderBy: { sortOrder: "asc" },
      include: { photos: { orderBy: { sortOrder: "asc" }, select: { photoId: true } } },
    }),
    prisma.guidedTour.findMany({
      where: { museumId },
      orderBy: { createdAt: "asc" },
      include: { stops: { orderBy: { sortOrder: "asc" } } },
    }),
    prisma.photoReaction.findMany({ where: { photo: { museumId } }, select: { photoId: true, emoji: true, userId: true } }),
  ]);

  const reactionCounts = new Map<string, Record<string, number>>();
  const myReactions = new Map<string, string[]>();
  for (const r of reactions) {
    const counts = reactionCounts.get(r.photoId) ?? {};
    counts[r.emoji] = (counts[r.emoji] ?? 0) + 1;
    reactionCounts.set(r.photoId, counts);
    if (r.userId === user.id) myReactions.set(r.photoId, [...(myReactions.get(r.photoId) ?? []), r.emoji]);
  }

  const scenePhotos: ScenePhoto[] = await Promise.all(
    photos.map(async (p) => ({
      id: p.id,
      title: p.title,
      caption: p.caption,
      takenAt: p.takenAt?.toISOString() ?? null,
      width: p.width,
      height: p.height,
      dominantColor: p.dominantColor,
      urls: await signedPhotoUrls(p),
      uploadedById: p.uploadedById,
      createdAt: p.createdAt.toISOString(),
      collectionIds: p.collections.map((c) => c.collectionId),
      favorite: p.favorites.length > 0,
      reactions: reactionCounts.get(p.id) ?? {},
      myReactions: myReactions.get(p.id) ?? [],
    })),
  );

  const sceneRooms: SceneRoom[] = rooms.map((r) => ({
    ...toRoomShape(r),
    walls: r.walls
      .filter((w) => (WALL_KEYS as readonly string[]).includes(w.wallKey))
      .map((w) => ({ id: w.id, wallKey: w.wallKey as WallKey })),
  }));

  const sceneFrames: SceneFrame[] = frames.map((f) => {
    const options = frameOptionsSchema.safeParse(f.frameOptions);
    return {
      id: f.id,
      roomId: f.roomId,
      wallId: f.wallId,
      wallKey: f.wall.wallKey as WallKey,
      photoId: f.photoId,
      u: f.positionU,
      v: f.positionV,
      rotation: f.rotation,
      width: f.width,
      height: f.height,
      style: ((FRAME_STYLES as readonly string[]).includes(f.frameStyle) ? f.frameStyle : "minimal-black") as FrameStyle,
      options: options.success ? options.data : {},
      caption: f.caption,
    };
  });

  const template = getTemplate(museum.templateId);
  const privacy = resolvePrivacy(museum.privacy);
  const overrides = themeOverridesSchema.safeParse(museum.theme);
  const lobby = sceneRooms.find((r) => r.roomType === "lobby") ?? sceneRooms[0];
  const spawn =
    lobby && roomAt([lobby], template.spawn.x, template.spawn.z)
      ? template.spawn
      : { x: lobby?.positionX ?? 0, z: (lobby?.positionZ ?? 0) + (lobby ? lobby.depth / 2 - 1.2 : 0), yaw: 0 };

  if (opts.recordVisit) await recordVisit(user.id, museumId);

  return {
    museum: {
      id: museum.id,
      name: museum.name,
      description: museum.description,
      templateId: museum.templateId,
      ownerId: museum.ownerId,
      ownerName: owner?.displayName ?? "",
      themeOverrides: overrides.success ? overrides.data : {},
      privacy,
      layoutVersion: museum.layoutVersion,
      coverPhotoId: museum.coverPhotoId,
    },
    theme: resolveTheme(template.theme, museum.theme),
    rooms: sceneRooms,
    frames: sceneFrames,
    photos: scenePhotos,
    collections: collections.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      sortOrder: c.sortOrder,
      photoIds: c.photos.map((p) => p.photoId),
    })),
    tours: tours.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      stops: t.stops.map((s) => ({ id: s.id, frameId: s.frameId, note: s.note })),
    })),
    viewer: {
      userId: user.id,
      displayName: user.displayName,
      role,
      isGuest: user.isAnonymous,
      permissions: permissionsFor(role, { guestsCanStartSharedViewing: privacy.guestsCanStartSharedViewing }),
    },
    spawn,
    isDemo: false,
    urlsExpireAt: new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString(),
  };
}
