import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/database/prisma";
import { readDevOutbox } from "@/lib/email";
import {
  acceptInvitation,
  acceptInvitationById,
  createInvitation,
  hashInvitationToken,
  listInvitations,
  previewInvitation,
  revokeInvitation,
} from "@/services/invitation-service";
import { createMuseum, getDashboard, updateMuseum } from "@/services/museum-service";
import { addMember, createUser, resetDatabase } from "../helpers/factories";

async function setup() {
  const owner = await createUser("Owner");
  const museum = await createMuseum(owner, { name: "Ours", description: "", templateId: "warm-romantic" }, "en");
  return { owner, museum };
}

const role = (museumId: string, userId: string) =>
  prisma.museumMembership.findUnique({ where: { museumId_userId: { museumId, userId } } }).then((m) => m?.role ?? null);

describe("invitations", () => {
  beforeEach(resetDatabase);

  it("stores only a hash of the token and lets a visitor join once", async () => {
    const { owner, museum } = await setup();
    const { token, url, invitation } = await createInvitation(owner, museum.id, { role: "VISITOR", maxUses: 1 }, "en");
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(url).toBe(`http://localhost:3000/invite/${token}`);
    const row = await prisma.museumInvitation.findUniqueOrThrow({ where: { id: invitation.id } });
    expect(row.tokenHash).toBe(hashInvitationToken(token));
    expect(JSON.stringify(row)).not.toContain(token);

    const preview = await previewInvitation(token);
    expect(preview).toMatchObject({ museumName: "Ours", role: "VISITOR", status: "active", guestsAllowed: true, emailLocked: false });

    const guest = await createUser("Friend");
    expect(await acceptInvitation(guest, token)).toMatchObject({ museumId: museum.id, role: "VISITOR", joined: true });
    expect(await role(museum.id, guest.id)).toBe("VISITOR");
    expect((await prisma.museumInvitation.findUniqueOrThrow({ where: { id: invitation.id } })).uses).toBe(1);

    // Used up for anyone else.
    const other = await createUser("Other");
    await expect(acceptInvitation(other, token)).rejects.toMatchObject({ code: "GONE" });
    expect((await previewInvitation(token))?.status).toBe("used");
    // Accepting again as an existing member is harmless and uses nothing.
    expect(await acceptInvitation(guest, token)).toMatchObject({ joined: false, role: "VISITOR" });
  });

  it("rejects unknown, malformed, revoked and expired tokens", async () => {
    const { owner, museum } = await setup();
    const user = await createUser();
    expect(await previewInvitation("not-a-token")).toBeNull();
    await expect(acceptInvitation(user, "x".repeat(43))).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(acceptInvitation(user, "../../etc")).rejects.toMatchObject({ code: "NOT_FOUND" });

    const revoked = await createInvitation(owner, museum.id, { role: "VISITOR", maxUses: 5 }, "en");
    await revokeInvitation(owner.id, museum.id, revoked.invitation.id);
    await expect(acceptInvitation(user, revoked.token)).rejects.toMatchObject({ code: "GONE" });

    const expired = await createInvitation(owner, museum.id, { role: "VISITOR", maxUses: 5 }, "en");
    await prisma.museumInvitation.update({ where: { id: expired.invitation.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(acceptInvitation(user, expired.token)).rejects.toMatchObject({ code: "GONE" });
    expect(await role(museum.id, user.id)).toBeNull();
  });

  it("only lets the owner manage invitations and never grants ownership", async () => {
    const { owner, museum } = await setup();
    const editor = await createUser("Editor");
    await addMember(museum.id, editor.id, "EDITOR");
    const stranger = await createUser("Stranger");
    await expect(createInvitation(editor, museum.id, { role: "VISITOR" }, "en")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createInvitation(stranger, museum.id, { role: "VISITOR" }, "en")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(createInvitation(owner, museum.id, { role: "OWNER" as "EDITOR" }, "en")).rejects.toThrow();
    await expect(listInvitations(editor.id, museum.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const inv = await createInvitation(owner, museum.id, { role: "EDITOR" }, "en");
    await expect(revokeInvitation(editor.id, museum.id, inv.invitation.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await listInvitations(owner.id, museum.id)).map((i) => i.id)).toEqual([inv.invitation.id]);
  });

  it("locks email invitations to that verified address and emails the link", async () => {
    const { owner, museum } = await setup();
    const invitee = await createUser("Invitee", { email: "friend@example.com" });
    const { token, invitation, emailed } = await createInvitation(owner, museum.id, { role: "EDITOR", email: "Friend@Example.com " }, "en");
    expect(emailed).toBe(true);
    expect(invitation).toMatchObject({ email: "friend@example.com", maxUses: 1 });
    const mail = readDevOutbox().find((m) => m.to === "friend@example.com");
    expect(mail?.link).toContain(`/invite/${token}`);

    const wrong = await createUser("Wrong");
    await expect(acceptInvitation(wrong, token)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const unverified = await createUser("Unverified", { email: "friend2@example.com", emailVerified: false });
    await prisma.museumInvitation.update({ where: { id: invitation.id }, data: { invitedEmail: "friend2@example.com" } });
    await expect(acceptInvitation(unverified, token)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await prisma.museumInvitation.update({ where: { id: invitation.id }, data: { invitedEmail: "friend@example.com" } });

    // The dashboard lists it and accepts by id (verified email proves it).
    const dash = await getDashboard(invitee);
    expect(dash.pendingInvitations.map((p) => p.id)).toEqual([invitation.id]);
    await expect(acceptInvitationById(wrong, invitation.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await acceptInvitationById(invitee, invitation.id)).toMatchObject({ role: "EDITOR", joined: true });
    expect(await role(museum.id, invitee.id)).toBe("EDITOR");
  });

  it("requires a verified email to send invitations by email", async () => {
    const owner = await createUser("Owner", { emailVerified: false });
    const museum = await createMuseum(owner, { name: "Ours", description: "", templateId: "warm-romantic" }, "en");
    await expect(createInvitation(owner, museum.id, { role: "VISITOR", email: "a@example.com" }, "en")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createInvitation(owner, museum.id, { role: "VISITOR" }, "en")).resolves.toBeTruthy();
  });

  it("admits anonymous guests only as visitors and only when allowed", async () => {
    const { owner, museum } = await setup();
    const visitorLink = await createInvitation(owner, museum.id, { role: "VISITOR", maxUses: 5 }, "en");
    const editorLink = await createInvitation(owner, museum.id, { role: "EDITOR", maxUses: 5 }, "en");
    const guest = await createUser("Guest", { isAnonymous: true });
    expect((await previewInvitation(editorLink.token))?.guestsAllowed).toBe(false);
    await expect(acceptInvitation(guest, editorLink.token)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(acceptInvitation(guest, visitorLink.token)).resolves.toMatchObject({ role: "VISITOR" });

    await updateMuseum(owner.id, museum.id, { privacy: { allowAnonymousGuests: false } });
    const guest2 = await createUser("Guest", { isAnonymous: true });
    expect((await previewInvitation(visitorLink.token))?.guestsAllowed).toBe(false);
    await expect(acceptInvitation(guest2, visitorLink.token)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("does not consume uses for existing members but upgrades visitors with an editor link", async () => {
    const { owner, museum } = await setup();
    const friend = await createUser("Friend");
    await addMember(museum.id, friend.id, "VISITOR");
    const visitorLink = await createInvitation(owner, museum.id, { role: "VISITOR", maxUses: 1 }, "en");
    expect(await acceptInvitation(friend, visitorLink.token)).toMatchObject({ joined: false, role: "VISITOR" });
    expect((await prisma.museumInvitation.findUniqueOrThrow({ where: { id: visitorLink.invitation.id } })).uses).toBe(0);
    expect(await acceptInvitation(owner, visitorLink.token)).toMatchObject({ joined: false, role: "OWNER" });

    const editorLink = await createInvitation(owner, museum.id, { role: "EDITOR", maxUses: 1 }, "en");
    expect(await acceptInvitation(friend, editorLink.token)).toMatchObject({ joined: true, role: "EDITOR" });
    expect(await role(museum.id, friend.id)).toBe("EDITOR");
  });

  it("never exceeds maxUses under concurrent redemption", async () => {
    const { owner, museum } = await setup();
    const { token } = await createInvitation(owner, museum.id, { role: "VISITOR", maxUses: 2 }, "en");
    const users = await Promise.all(Array.from({ length: 6 }, (_, i) => createUser(`U${i}`)));
    const results = await Promise.allSettled(users.map((u) => acceptInvitation(u, token)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    expect(await prisma.museumMembership.count({ where: { museumId: museum.id, role: "VISITOR" } })).toBe(2);
  });
});
