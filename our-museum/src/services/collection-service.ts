import "server-only";
import { prisma } from "@/lib/database/prisma";
import { errors } from "@/lib/errors";
import { requireMuseumAccess } from "./access";
import { notifyMuseumChanged } from "./realtime-notify";

export async function createCollection(userId: string, museumId: string, input: { name: string; description?: string }) {
  await requireMuseumAccess(userId, museumId, "collection.manage");
  const count = await prisma.photoCollection.count({ where: { museumId } });
  if (count >= 60) throw errors.conflict("This museum has the maximum number of collections.");
  const last = await prisma.photoCollection.aggregate({ where: { museumId }, _max: { sortOrder: true } });
  const c = await prisma.photoCollection.create({
    data: { museumId, name: input.name, description: input.description ?? "", sortOrder: (last._max.sortOrder ?? -1) + 1 },
  });
  notifyMuseumChanged(museumId, "photos", userId);
  return c;
}

export async function updateCollection(userId: string, museumId: string, collectionId: string, input: { name: string; description?: string }) {
  await requireMuseumAccess(userId, museumId, "collection.manage");
  const res = await prisma.photoCollection.updateMany({
    where: { id: collectionId, museumId },
    data: { name: input.name, ...(input.description !== undefined ? { description: input.description } : {}) },
  });
  if (!res.count) throw errors.notFound("Collection not found");
  notifyMuseumChanged(museumId, "photos", userId);
}

/** Deleting a collection never deletes its photos. */
export async function deleteCollection(userId: string, museumId: string, collectionId: string) {
  await requireMuseumAccess(userId, museumId, "collection.manage");
  const res = await prisma.photoCollection.deleteMany({ where: { id: collectionId, museumId } });
  if (!res.count) throw errors.notFound("Collection not found");
  notifyMuseumChanged(museumId, "photos", userId);
}

export async function reorderCollections(userId: string, museumId: string, ids: string[]) {
  await requireMuseumAccess(userId, museumId, "collection.manage");
  await prisma.$transaction(async (tx) => {
    const rows = await tx.photoCollection.findMany({ where: { museumId }, select: { id: true } });
    const all = new Set(rows.map((r) => r.id));
    if (ids.length !== all.size || ids.some((id) => !all.has(id))) throw errors.validation("Collection list does not match");
    for (const [i, id] of ids.entries()) await tx.photoCollection.update({ where: { id }, data: { sortOrder: i } });
  });
  notifyMuseumChanged(museumId, "photos", userId);
}

/** Replaces a collection's photos with the given ordered list. */
export async function setCollectionPhotos(userId: string, museumId: string, collectionId: string, photoIds: string[]) {
  await requireMuseumAccess(userId, museumId, "collection.manage");
  await prisma.$transaction(async (tx) => {
    const col = await tx.photoCollection.findFirst({ where: { id: collectionId, museumId } });
    if (!col) throw errors.notFound("Collection not found");
    const unique = [...new Set(photoIds)];
    const valid = await tx.photo.findMany({ where: { museumId, id: { in: unique } }, select: { id: true } });
    if (valid.length !== unique.length) throw errors.validation("Some photos do not belong to this museum");
    await tx.collectionPhoto.deleteMany({ where: { collectionId } });
    if (unique.length) await tx.collectionPhoto.createMany({ data: unique.map((photoId, i) => ({ collectionId, photoId, sortOrder: i })) });
  });
  notifyMuseumChanged(museumId, "photos", userId);
}
