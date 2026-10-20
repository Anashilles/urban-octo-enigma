import "server-only";
import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import { resolvePrivacy } from "@/features/museums/theme";
import { TICKET_AUDIENCE, TICKET_ISSUER, TICKET_TTL_SECONDS, type TicketClaims } from "@/features/realtime/protocol";
import { env, realtimeTicketSecret } from "@/lib/env";
import { permissionsFor } from "@/lib/permissions";
import { requireMuseumAccess } from "./access";
import { getAvatar } from "./avatar-service";

/**
 * Issues a short-lived, single-use ticket for the realtime service after
 * checking museum membership. The service trusts only what is in the ticket,
 * so a new ticket (and a fresh membership check) is needed for every connection.
 */
export async function issueRealtimeTicket(user: { id: string; displayName: string; isAnonymous: boolean }, museumId: string) {
  const { museum, role } = await requireMuseumAccess(user.id, museumId, "museum.view");
  const privacy = resolvePrivacy(museum.privacy);
  const perms = permissionsFor(role, { guestsCanStartSharedViewing: privacy.guestsCanStartSharedViewing });
  const { config: avatar } = await getAvatar(user.id);
  const claims: Omit<TicketClaims, "sub"> = {
    mid: museumId,
    role,
    name: user.displayName,
    guest: user.isAnonymous,
    avatar,
    perms: {
      sharedStart: perms["shared.start"],
      sharedManage: perms["shared.manage"],
      voice: perms["voice.join"] && privacy.voiceChatEnabled,
      react: perms["photo.react"] && privacy.reactionsEnabled,
      tour: perms["tour.present"],
    },
  };
  const expiresAt = new Date(Date.now() + TICKET_TTL_SECONDS * 1000);
  const ticket = await new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuer(TICKET_ISSUER)
    .setAudience(TICKET_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .setJti(randomUUID())
    .sign(new TextEncoder().encode(realtimeTicketSecret()));
  return { ticket, url: env().NEXT_PUBLIC_REALTIME_URL, expiresAt: expiresAt.toISOString() };
}
