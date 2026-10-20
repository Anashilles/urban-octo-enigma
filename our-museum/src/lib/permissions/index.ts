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
];

const VISITOR: Action[] = ["museum.view", "photo.react", "voice.join", "shared.start"];

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
