import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma, type Tx } from "@/lib/database/prisma";

export type AuditEventType =
  | "museum.created"
  | "museum.updated"
  | "museum.deleted"
  | "room.created"
  | "room.updated"
  | "room.deleted"
  | "photo.uploaded"
  | "photo.updated"
  | "photo.deleted"
  | "upload.failed"
  | "frame.placed"
  | "frame.updated"
  | "frame.deleted"
  | "invitation.created"
  | "invitation.revoked"
  | "invitation.redeemed"
  | "member.removed"
  | "member.roleChanged"
  | "member.left"
  | "tour.saved"
  | "tour.deleted"
  | "museum.exported"
  | "comment.removed"
  | "guestbook.removed";

/**
 * Appends to the audit log. Metadata must be small and must never contain
 * secrets, tokens, email addresses or photo contents.
 */
export async function recordEvent(
  input: {
    museumId: string | null;
    actorId: string | null;
    eventType: AuditEventType;
    entityId?: string | null;
    metadata?: Prisma.InputJsonValue;
  },
  db: Tx | typeof prisma = prisma,
) {
  await db.museumEvent.create({
    data: {
      museumId: input.museumId,
      actorId: input.actorId,
      eventType: input.eventType,
      entityId: input.entityId ?? null,
      metadata: input.metadata ?? {},
    },
  });
}
