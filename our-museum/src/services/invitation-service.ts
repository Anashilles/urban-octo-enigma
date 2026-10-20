import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import type { MuseumRole } from "@/generated/prisma/client";
import { resolvePrivacy } from "@/features/museums/theme";
import type { Locale } from "@/i18n/config";
import { prisma } from "@/lib/database/prisma";
import { sendEmail } from "@/lib/email";
import { invitationEmail } from "@/lib/email/templates";
import { env } from "@/lib/env";
import { errors } from "@/lib/errors";
import { apiLimiter, RATE_RULES, type RuleName } from "@/lib/rate-limit";
import { createInvitationSchema, invitationTokenSchema, type CreateInvitationInput } from "@/lib/validation/invitations";
import { requireMuseumAccess } from "./access";
import { recordEvent } from "./audit-service";
import { notifyMuseumChanged } from "./realtime-notify";

export const MAX_MEMBERS_PER_MUSEUM = 50;
const MAX_ACTIVE_INVITATIONS = 50;

export type InvitationStatus = "active" | "expired" | "revoked" | "used";

interface Actor {
  id: string;
  displayName: string;
  email: string;
  emailVerified: boolean;
  isAnonymous: boolean;
}

function limit(key: string, rule: RuleName) {
  const r = apiLimiter.take(`${rule}:${key}`, RATE_RULES[rule]);
  if (!r.ok) throw errors.rateLimited(r.retryAfterSeconds);
}

export function hashInvitationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function newToken() {
  return randomBytes(32).toString("base64url");
}

export function invitationStatus(i: { revokedAt: Date | null; expiresAt: Date; uses: number; maxUses: number }, now = new Date()): InvitationStatus {
  if (i.revokedAt) return "revoked";
  if (i.expiresAt <= now) return "expired";
  if (i.uses >= i.maxUses) return "used";
  return "active";
}

function toResponse(i: {
  id: string;
  role: MuseumRole;
  invitedEmail: string | null;
  expiresAt: Date;
  maxUses: number;
  uses: number;
  revokedAt: Date | null;
  createdAt: Date;
  lastUsedAt: Date | null;
}) {
  return {
    id: i.id,
    role: i.role as "EDITOR" | "VISITOR",
    email: i.invitedEmail,
    expiresAt: i.expiresAt.toISOString(),
    maxUses: i.maxUses,
    uses: i.uses,
    createdAt: i.createdAt.toISOString(),
    lastUsedAt: i.lastUsedAt?.toISOString() ?? null,
    status: invitationStatus(i),
  };
}
export type InvitationSummary = ReturnType<typeof toResponse>;

export function invitationUrl(token: string) {
  return `${env().APP_URL.replace(/\/$/, "")}/invite/${token}`;
}

/**
 * Creates an invitation. The plaintext token is returned exactly once; only
 * its SHA-256 hash is stored.
 */
export async function createInvitation(actor: Actor, museumId: string, input: CreateInvitationInput, locale: Locale) {
  const { museum } = await requireMuseumAccess(actor.id, museumId, "invitation.manage");
  const data = createInvitationSchema.parse(input);
  limit(`user:${actor.id}`, "invitationCreate");
  if (data.email) {
    if (actor.isAnonymous || !actor.emailVerified) throw errors.forbidden("Verify your email address before sending invitations by email.");
    limit(`user:${actor.id}`, "email");
  }
  const active = await prisma.museumInvitation.count({ where: { museumId, revokedAt: null, expiresAt: { gt: new Date() } } });
  if (active >= MAX_ACTIVE_INVITATIONS) throw errors.conflict("This museum has too many open invitations. Revoke some first.");

  const token = newToken();
  const expiresAt = new Date(Date.now() + data.expiresInHours * 3600_000);
  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.museumInvitation.create({
      data: {
        museumId,
        tokenHash: hashInvitationToken(token),
        invitedEmail: data.email ?? null,
        role: data.role,
        expiresAt,
        maxUses: data.email ? 1 : data.maxUses,
        createdById: actor.id,
      },
    });
    await recordEvent({ museumId, actorId: actor.id, eventType: "invitation.created", entityId: created.id, metadata: { role: data.role, byEmail: Boolean(data.email) } }, tx);
    return created;
  });

  const url = invitationUrl(token);
  let emailed = false;
  if (data.email) {
    await sendEmail(invitationEmail({ to: data.email, inviterName: actor.displayName, museumName: museum.name, url, expiresAt, locale }));
    emailed = true;
  }
  return { invitation: toResponse(row), token, url, emailed };
}

export async function listInvitations(actorId: string, museumId: string) {
  await requireMuseumAccess(actorId, museumId, "invitation.manage");
  const since = new Date(Date.now() - 14 * 24 * 3600_000);
  const rows = await prisma.museumInvitation.findMany({
    where: { museumId, OR: [{ revokedAt: null, expiresAt: { gt: since } }, { revokedAt: { gt: since } }] },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return rows.map(toResponse);
}

export async function revokeInvitation(actorId: string, museumId: string, invitationId: string) {
  await requireMuseumAccess(actorId, museumId, "invitation.manage");
  const inv = await prisma.museumInvitation.findFirst({ where: { id: invitationId, museumId } });
  if (!inv) throw errors.notFound("Invitation not found");
  if (inv.revokedAt) return toResponse(inv);
  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.museumInvitation.update({ where: { id: inv.id }, data: { revokedAt: new Date() } });
    await recordEvent({ museumId, actorId, eventType: "invitation.revoked", entityId: inv.id }, tx);
    return u;
  });
  return toResponse(updated);
}

/** Public preview shown on the /invite/[token] page. Never reveals the invited email. */
export async function previewInvitation(token: string) {
  if (!invitationTokenSchema.safeParse(token).success) return null;
  const inv = await prisma.museumInvitation.findUnique({
    where: { tokenHash: hashInvitationToken(token) },
    include: {
      museum: { select: { id: true, name: true, templateId: true, privacy: true, owner: { select: { displayName: true } } } },
      createdBy: { select: { displayName: true } },
    },
  });
  if (!inv) return null;
  const privacy = resolvePrivacy(inv.museum.privacy);
  return {
    museumId: inv.museum.id,
    museumName: inv.museum.name,
    templateId: inv.museum.templateId,
    ownerName: inv.museum.owner.displayName,
    inviterName: inv.createdBy.displayName,
    role: inv.role as "EDITOR" | "VISITOR",
    expiresAt: inv.expiresAt.toISOString(),
    status: invitationStatus(inv),
    emailLocked: Boolean(inv.invitedEmail),
    /** Guests (display name only) may join visitor invitations when the owner allows it. */
    guestsAllowed: privacy.allowAnonymousGuests && inv.role === "VISITOR" && !inv.invitedEmail,
  };
}
export type InvitationPreview = NonNullable<Awaited<ReturnType<typeof previewInvitation>>>;

interface Joiner {
  id: string;
  email: string;
  emailVerified: boolean;
  isAnonymous: boolean;
}

const STATUS_MESSAGES: Record<Exclude<InvitationStatus, "active">, string> = {
  expired: "This invitation has expired.",
  revoked: "This invitation was revoked.",
  used: "This invitation has already been used.",
};

/** Joins the museum with an invitation token (or, for email invitations, by id). */
async function redeem(user: Joiner, where: { tokenHash: string } | { id: string }, requireEmailMatch: boolean) {
  const result = await prisma.$transaction(async (tx) => {
    // Lock the row so concurrent redemptions cannot exceed maxUses.
    const locked =
      "tokenHash" in where
        ? await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "museum_invitations" WHERE "tokenHash" = ${where.tokenHash} FOR UPDATE`
        : await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "museum_invitations" WHERE id = ${where.id} FOR UPDATE`;
    const id = locked[0]?.id;
    if (!id) throw errors.notFound("This invitation link is not valid.");
    const inv = await tx.museumInvitation.findUniqueOrThrow({ where: { id }, include: { museum: { select: { privacy: true } } } });

    // Already a member: nothing to redeem, unless the link upgrades a visitor to editor.
    const existing = await tx.museumMembership.findUnique({ where: { museumId_userId: { museumId: inv.museumId, userId: user.id } } });
    const upgrade = existing?.role === "VISITOR" && inv.role === "EDITOR";
    if (existing && !upgrade) return { museumId: inv.museumId, role: existing.role, joined: false };

    const status = invitationStatus(inv);
    if (status !== "active") throw errors.gone(STATUS_MESSAGES[status]);
    if (inv.invitedEmail || requireEmailMatch) {
      const matches = !user.isAnonymous && user.emailVerified && inv.invitedEmail !== null && user.email.toLowerCase() === inv.invitedEmail.toLowerCase();
      if (!matches) throw errors.forbidden("This invitation was sent to a different email address. Sign in with that verified address to accept it.");
    }
    if (user.isAnonymous) {
      const privacy = resolvePrivacy(inv.museum.privacy);
      if (!privacy.allowAnonymousGuests || inv.role !== "VISITOR") throw errors.forbidden("Please create an account to accept this invitation.");
    }

    if (existing) {
      await tx.museumMembership.update({ where: { id: existing.id }, data: { role: "EDITOR", invitationId: inv.id } });
    } else {
      const members = await tx.museumMembership.count({ where: { museumId: inv.museumId } });
      if (members >= MAX_MEMBERS_PER_MUSEUM) throw errors.conflict("This museum already has the maximum number of members.");
      await tx.museumMembership.create({ data: { museumId: inv.museumId, userId: user.id, role: inv.role, invitationId: inv.id } });
    }
    await tx.museumInvitation.update({ where: { id: inv.id }, data: { uses: { increment: 1 }, lastUsedAt: new Date() } });
    await recordEvent({ museumId: inv.museumId, actorId: user.id, eventType: "invitation.redeemed", entityId: inv.id, metadata: { role: inv.role } }, tx);
    return { museumId: inv.museumId, role: inv.role, joined: true };
  });
  if (result.joined) notifyMuseumChanged(result.museumId, "members", user.id);
  return result;
}

export async function acceptInvitation(user: Joiner, token: string) {
  if (!invitationTokenSchema.safeParse(token).success) throw errors.notFound("This invitation link is not valid.");
  return redeem(user, { tokenHash: hashInvitationToken(token) }, false);
}

/** Accepts an email invitation from the dashboard (no token; the verified email proves it). */
export async function acceptInvitationById(user: Joiner, invitationId: string) {
  return redeem(user, { id: z.string().min(1).max(64).parse(invitationId) }, true);
}
