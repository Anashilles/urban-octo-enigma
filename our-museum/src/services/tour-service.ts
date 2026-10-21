import "server-only";
import { prisma } from "@/lib/database/prisma";
import { errors } from "@/lib/errors";
import { tourSchema, type TourInput } from "@/lib/validation/tours";
import { requireMuseumAccess } from "./access";
import { recordEvent } from "./audit-service";
import { tidyNarrations } from "./narration-service";
import { notifyMuseumChanged } from "./realtime-notify";

const MAX_TOURS_PER_MUSEUM = 30;

function toResponse(t: { id: string; name: string; description: string; stops: Array<{ id: string; frameId: string; note: string }> }) {
  return { id: t.id, name: t.name, description: t.description, stops: t.stops.map((s) => ({ id: s.id, frameId: s.frameId, note: s.note })) };
}

/** Creates a tour, or replaces an existing tour's details and stops. */
export async function saveTour(actorId: string, museumId: string, input: TourInput, tourId?: string) {
  await requireMuseumAccess(actorId, museumId, "tour.manage");
  const data = tourSchema.parse(input);
  const frameIds = [...new Set(data.stops.map((s) => s.frameId))];
  const frames = await prisma.photoFrame.count({ where: { museumId, id: { in: frameIds } } });
  if (frames !== frameIds.length) throw errors.validation("Every stop must be a photograph hanging in this museum.");

  const tour = await prisma.$transaction(async (tx) => {
    if (tourId) {
      const existing = await tx.guidedTour.findFirst({ where: { id: tourId, museumId }, select: { id: true } });
      if (!existing) throw errors.notFound("Tour not found");
      await tx.tourStop.deleteMany({ where: { tourId } });
      await tx.guidedTour.update({ where: { id: tourId }, data: { name: data.name, description: data.description } });
    } else {
      const count = await tx.guidedTour.count({ where: { museumId } });
      if (count >= MAX_TOURS_PER_MUSEUM) throw errors.conflict("This museum already has the maximum number of tours.");
    }
    const id =
      tourId ??
      (await tx.guidedTour.create({ data: { museumId, name: data.name, description: data.description, createdById: actorId }, select: { id: true } })).id;
    await tx.tourStop.createMany({ data: data.stops.map((s, i) => ({ tourId: id, frameId: s.frameId, sortOrder: i, note: s.note })) });
    await recordEvent({ museumId, actorId, eventType: "tour.saved", entityId: id, metadata: { stops: data.stops.length } }, tx);
    return tx.guidedTour.findUniqueOrThrow({ where: { id }, include: { stops: { orderBy: { sortOrder: "asc" } } } });
  });
  // Narrations are keyed by (tour, photograph), so they survive the stops being rewritten.
  if (tourId) await tidyNarrations(museumId);
  notifyMuseumChanged(museumId, "tours", actorId);
  return toResponse(tour);
}

export async function deleteTour(actorId: string, museumId: string, tourId: string) {
  await requireMuseumAccess(actorId, museumId, "tour.manage");
  const existing = await prisma.guidedTour.findFirst({ where: { id: tourId, museumId }, select: { id: true } });
  if (!existing) throw errors.notFound("Tour not found");
  await prisma.$transaction(async (tx) => {
    await tx.guidedTour.delete({ where: { id: tourId } });
    await recordEvent({ museumId, actorId, eventType: "tour.deleted", entityId: tourId }, tx);
  });
  await tidyNarrations(museumId);
  notifyMuseumChanged(museumId, "tours", actorId);
}
