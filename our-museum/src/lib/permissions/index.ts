/**
 * Role-based permissions. This table is the single source of truth: the API
 * and realtime service enforce it on the server, and the UI uses the same
 * table only to hide controls the user cannot use.
 */
export const ROLES = ["OWNER", "EDITOR", "VISITOR"] as const;
export type Role = (typeof ROLES)[number];

export const ACTIONS = [
  "museum.view",
  "museum.editSettings",
  "museum.editAppearance",
  "museum.delete",
  "museum.configurePrivacy",
  "photo.upload",
  "photo.edit",
  "photo.deleteOwn",
  "photo.deleteAny",
  "collection.manage",
  "room.create",
  "room.delete",
  "room.edit",
  "frame.place",
  "frame.edit",
  "frame.delete",
  "invitation.manage",
  "member.remove",
  "member.changeRole",
  "shared.start",
  "shared.manage",
  "tour.manage",
  "tour.present",
  "photo.react",
  "voice.join",
  "comment.write",
  "comment.moderate",
  "museum.export",
] as const;
export type Action = (typeof ACTIONS)[number];

const OWNER_ONLY: Action[] = [
  "museum.delete",
  "museum.configurePrivacy",
  "room.create",
  "room.delete",
  "photo.deleteAny",
  "invitation.manage",
  "member.remove",
  "member.changeRole",
  "shared.manage",
  "comment.moderate",
  "museum.export",
];

const EDITOR: Action[] = [
  "museum.view",
  "museum.editSettings",
  "museum.editAppearance",
  "photo.upload",
  "photo.edit",
  "photo.deleteOwn",
  "collection.manage",
  "room.edit",
  "frame.place",
  "frame.edit",
  "frame.delete",
  "shared.start",
  "tour.manage",
  "tour.present",
  "photo.react",
  "voice.join",
  "comment.write",
];

const VISITOR: Action[] = ["museum.view", "photo.react", "voice.join", "shared.start", "comment.write"];

const TABLE: Record<Role, ReadonlySet<Action>> = {
  OWNER: new Set<Action>([...EDITOR, ...OWNER_ONLY]),
  EDITOR: new Set<Action>(EDITOR),
  VISITOR: new Set<Action>(VISITOR),
};

export interface PermissionContext {
  /** Museum privacy flag: may visitors start Look Together sessions? */
  guestsCanStartSharedViewing?: boolean;
}

export function can(role: Role | null | undefined, action: Action, ctx: PermissionContext = {}): boolean {
  if (!role) return false;
  if (action === "shared.start" && role === "VISITOR" && ctx.guestsCanStartSharedViewing === false) return false;
  return TABLE[role].has(action);
}

export function permissionsFor(role: Role, ctx: PermissionContext = {}): Record<Action, boolean> {
  return Object.fromEntries(ACTIONS.map((a) => [a, can(role, a, ctx)])) as Record<Action, boolean>;
}

/** Can the role edit the museum layout at all (place/move frames)? */
export function canEditLayout(role: Role | null | undefined) {
  return can(role, "frame.place");
}

/**
 * Site administrators: listed in ADMIN_EMAILS *and* holding a verified,
 * non-guest account — otherwise anyone could register an admin address that
 * has not signed up yet while email verification is optional.
 */
export function isSiteAdmin(user: { email: string; emailVerified: boolean; isAnonymous: boolean }, adminEmails: readonly string[]): boolean {
  if (!user.emailVerified || user.isAnonymous) return false;
  const email = user.email.toLowerCase();
  return adminEmails.some((a) => a.toLowerCase() === email);
}
