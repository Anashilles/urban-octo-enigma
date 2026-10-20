import "server-only";
import { prisma } from "@/lib/database/prisma";
import { errors } from "@/lib/errors";
import { requireMuseumAccess } from "./access";
import { recordEvent } from "./audit-service";
import { kickFromMuseum, notifyMuseumChanged } from "./realtime-notify";

export async function listMembers(userId: string, museumId: string) {
  await requireMuseumAccess(userId, museumId, "museum.view");
  const rows = await prisma.museumMembership.findMany({
    where: { museumId },
    include: { user: { select: { id: true, displayName: true, isAnonymous: true } } },
    orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
  });
  return rows.map((m) => ({
    userId: m.userId,
    displayName: m.user.displayName,
    isGuest: Boolean(m.user.isAnonymous),
    role: m.role,
    joinedAt: m.joinedAt.toISOString(),
  }));
}

export async function removeMember(ownerId: string, museumId: string, memberUserId: string) {
  await requireMuseumAccess(ownerId, museumId, "member.remove");
  const membership = await prisma.museumMembership.findUnique({ where: { museumId_userId: { museumId, userId: memberUserId } } });
  if (!membership) throw errors.notFound("Member not found");
  if (membership.role === "OWNER") throw errors.forbidden("The owner cannot be removed.");
  await prisma.$transaction(async (tx) => {
    await tx.museumMembership.delete({ where: { id: membership.id } });
    await recordEvent({ museumId, actorId: ownerId, eventType: "member.removed", entityId: memberUserId }, tx);
  });
  kickFromMuseum(museumId, memberUserId, "removed");
  notifyMuseumChanged(museumId, "members", ownerId);
}

export async function changeMemberRole(ownerId: string, museumId: string, memberUserId: string, role: "EDITOR" | "VISITOR") {
  await requireMuseumAccess(ownerId, museumId, "member.changeRole");
  const membership = await prisma.museumMembership.findUnique({
    where: { museumId_userId: { museumId, userId: memberUserId } },
    include: { user: { select: { isAnonymous: true } } },
  });
  if (!membership) throw errors.notFound("Member not found");
  if (membership.role === "OWNER") throw errors.forbidden("The owner's role cannot be changed.");
  if (role === "EDITOR" && membership.user.isAnonymous) throw errors.forbidden("Guests must create an account before they can edit.");
  await prisma.$transaction(async (tx) => {
    await tx.museumMembership.update({ where: { id: membership.id }, data: { role } });
    await recordEvent({ museumId, actorId: ownerId, eventType: "member.roleChanged", entityId: memberUserId, metadata: { role } }, tx);
  });
  // Reconnect so the realtime ticket carries the new role.
  kickFromMuseum(museumId, memberUserId, "removed");
  notifyMuseumChanged(museumId, "members", ownerId);
}

export async function leaveMuseum(userId: string, museumId: string) {
  const access = await requireMuseumAccess(userId, museumId, "museum.view");
  if (access.role === "OWNER") throw errors.forbidden("Owners cannot leave their own museum. Delete it instead.");
  await prisma.$transaction(async (tx) => {
    await tx.museumMembership.delete({ where: { museumId_userId: { museumId, userId } } });
    await recordEvent({ museumId, actorId: userId, eventType: "member.left", entityId: userId }, tx);
  });
  kickFromMuseum(museumId, userId, "removed");
  notifyMuseumChanged(museumId, "members", userId);
}

/**
 * When a guest (anonymous user) upgrades to a full account, their memberships,
 * visits and avatar move to the new account before the guest user is deleted.
 */
export async function linkAnonymousAccount(anonymousUserId: string, newUserId: string) {
  await prisma.$transaction(async (tx) => {
    const memberships = await tx.museumMembership.findMany({ where: { userId: anonymousUserId } });
    for (const m of memberships) {
      const existing = await tx.museumMembership.findUnique({ where: { museumId_userId: { museumId: m.museumId, userId: newUserId } } });
      if (!existing) await tx.museumMembership.update({ where: { id: m.id }, data: { userId: newUserId } });
    }
    const visits = await tx.museumVisit.findMany({ where: { userId: anonymousUserId } });
    for (const v of visits) {
      await tx.museumVisit.upsert({
        where: { userId_museumId: { userId: newUserId, museumId: v.museumId } },
        create: { userId: newUserId, museumId: v.museumId, lastVisitedAt: v.lastVisitedAt, visitCount: v.visitCount },
        update: {},
      });
    }
    const avatar = await tx.avatarProfile.findUnique({ where: { userId: anonymousUserId } });
    const hasAvatar = await tx.avatarProfile.findUnique({ where: { userId: newUserId } });
    if (avatar && !hasAvatar) await tx.avatarProfile.update({ where: { id: avatar.id }, data: { userId: newUserId } });
  });
}
