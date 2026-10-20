import "server-only";
import type { Museum } from "@/generated/prisma/client";
import { prisma, type Tx } from "@/lib/database/prisma";
import { errors } from "@/lib/errors";
import { can, type Action, type Role } from "@/lib/permissions";
import { resolvePrivacy } from "@/features/museums/theme";

export interface MuseumAccess {
  museum: Museum;
  role: Role;
  userId: string;
}

/** The caller's role in a museum, or null when they are not a member. */
export async function getRole(userId: string, museumId: string, db: Tx | typeof prisma = prisma): Promise<Role | null> {
  const m = await db.museumMembership.findUnique({
    where: { museumId_userId: { museumId, userId } },
    select: { role: true },
  });
  return m?.role ?? null;
}

/**
 * Loads a museum the user can access and checks an action against their role.
 * Non-members get NOT_FOUND so private museums are not even confirmed to exist.
 */
export async function requireMuseumAccess(
  userId: string,
  museumId: string,
  action: Action = "museum.view",
  db: Tx | typeof prisma = prisma,
): Promise<MuseumAccess> {
  if (typeof museumId !== "string" || museumId.length < 8 || museumId.length > 64) throw errors.notFound();
  const membership = await db.museumMembership.findUnique({
    where: { museumId_userId: { museumId, userId } },
    include: { museum: true },
  });
  if (!membership) throw errors.notFound("Museum not found");
  const privacy = resolvePrivacy(membership.museum.privacy);
  if (!can(membership.role, action, { guestsCanStartSharedViewing: privacy.guestsCanStartSharedViewing })) {
    throw errors.forbidden();
  }
  return { museum: membership.museum, role: membership.role, userId };
}
