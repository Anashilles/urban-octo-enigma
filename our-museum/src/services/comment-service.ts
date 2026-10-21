import "server-only";
import { resolvePrivacy } from "@/features/museums/theme";
import { parseWith } from "@/lib/api/handler";
import { prisma } from "@/lib/database/prisma";
import { errors } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { commentSchema, guestbookSchema } from "@/lib/validation/comments";
import { requireMuseumAccess, type MuseumAccess } from "./access";
import { recordEvent } from "./audit-service";
import { notifyMuseumChanged } from "./realtime-notify";

const LIST_LIMIT = 200;

export interface NoteResponse {
  id: string;
  body: string;
  createdAt: string;
  author: { name: string; guest: boolean; self: boolean };
  /** The viewer wrote it, or may moderate this museum. */
  canDelete: boolean;
}

type Row = { id: string; body: string; createdAt: Date; authorId: string; author: { displayName: string; isAnonymous: boolean | null } };

function toResponse(row: Row, access: MuseumAccess): NoteResponse {
  const self = row.authorId === access.userId;
  return {
    id: row.id,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    author: { name: row.author.displayName, guest: Boolean(row.author.isAnonymous), self },
    canDelete: self || can(access.role, "comment.moderate"),
  };
}

const authorSelect = { select: { displayName: true, isAnonymous: true } } as const;

function requireEnabled(access: MuseumAccess) {
  if (!resolvePrivacy(access.museum.privacy).commentsEnabled) throw errors.forbidden("Comments are turned off in this museum.");
}

async function requirePhoto(museumId: string, photoId: string) {
  const photo = await prisma.photo.findFirst({ where: { id: photoId, museumId }, select: { id: true } });
  if (!photo) throw errors.notFound("Photo not found");
}

/* Photo comments ------------------------------------------------------------ */

export async function listComments(userId: string, museumId: string, photoId: string) {
  const access = await requireMuseumAccess(userId, museumId, "museum.view");
  await requirePhoto(museumId, photoId);
  if (!resolvePrivacy(access.museum.privacy).commentsEnabled) return { enabled: false, comments: [] as NoteResponse[] };
  const rows = await prisma.photoComment.findMany({
    where: { photoId, museumId },
    orderBy: { createdAt: "desc" },
    take: LIST_LIMIT,
    include: { author: authorSelect },
  });
  return { enabled: true, comments: rows.reverse().map((r) => toResponse(r, access)) };
}

export async function addComment(userId: string, museumId: string, photoId: string, input: unknown) {
  const access = await requireMuseumAccess(userId, museumId, "comment.write");
  requireEnabled(access);
  const { body } = parseWith(commentSchema, input);
  await requirePhoto(museumId, photoId);
  const row = await prisma.photoComment.create({ data: { museumId, photoId, authorId: userId, body }, include: { author: authorSelect } });
  notifyMuseumChanged(museumId, "comments", userId);
  return toResponse(row, access);
}

export async function deleteComment(userId: string, museumId: string, commentId: string) {
  const access = await requireMuseumAccess(userId, museumId, "museum.view");
  const row = await prisma.photoComment.findFirst({ where: { id: commentId, museumId }, select: { id: true, authorId: true, photoId: true } });
  if (!row) throw errors.notFound("Comment not found");
  const own = row.authorId === userId;
  if (!own && !can(access.role, "comment.moderate")) throw errors.forbidden();
  await prisma.photoComment.delete({ where: { id: row.id } });
  if (!own) await recordEvent({ museumId, actorId: userId, eventType: "comment.removed", entityId: row.id, metadata: { photoId: row.photoId } });
  notifyMuseumChanged(museumId, "comments", userId);
}

/* Guestbook ------------------------------------------------------------------- */

export async function listGuestbook(userId: string, museumId: string) {
  const access = await requireMuseumAccess(userId, museumId, "museum.view");
  if (!resolvePrivacy(access.museum.privacy).commentsEnabled) return { enabled: false, entries: [] as NoteResponse[] };
  const rows = await prisma.guestbookEntry.findMany({
    where: { museumId },
    orderBy: { createdAt: "desc" },
    take: LIST_LIMIT,
    include: { author: authorSelect },
  });
  return { enabled: true, entries: rows.map((r) => toResponse(r, access)) };
}

export async function signGuestbook(userId: string, museumId: string, input: unknown) {
  const access = await requireMuseumAccess(userId, museumId, "comment.write");
  requireEnabled(access);
  const { body } = parseWith(guestbookSchema, input);
  const row = await prisma.guestbookEntry.create({ data: { museumId, authorId: userId, body }, include: { author: authorSelect } });
  notifyMuseumChanged(museumId, "comments", userId);
  return toResponse(row, access);
}

export async function deleteGuestbookEntry(userId: string, museumId: string, entryId: string) {
  const access = await requireMuseumAccess(userId, museumId, "museum.view");
  const row = await prisma.guestbookEntry.findFirst({ where: { id: entryId, museumId }, select: { id: true, authorId: true } });
  if (!row) throw errors.notFound("Entry not found");
  const own = row.authorId === userId;
  if (!own && !can(access.role, "comment.moderate")) throw errors.forbidden();
  await prisma.guestbookEntry.delete({ where: { id: row.id } });
  if (!own) await recordEvent({ museumId, actorId: userId, eventType: "guestbook.removed", entityId: row.id });
  notifyMuseumChanged(museumId, "comments", userId);
}
