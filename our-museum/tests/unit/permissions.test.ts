import { describe, expect, it } from "vitest";
import { can } from "@/lib/permissions";

describe("permissions", () => {
  it("gives the owner full control", () => {
    for (const a of ["museum.delete", "room.create", "room.delete", "invitation.manage", "member.remove", "photo.deleteAny"] as const) {
      expect(can("OWNER", a)).toBe(true);
    }
  });

  it("lets editors arrange and upload but not manage people or structure", () => {
    expect(can("EDITOR", "photo.upload")).toBe(true);
    expect(can("EDITOR", "frame.place")).toBe(true);
    expect(can("EDITOR", "room.edit")).toBe(true);
    expect(can("EDITOR", "invitation.manage")).toBe(false);
    expect(can("EDITOR", "room.delete")).toBe(false);
    expect(can("EDITOR", "museum.delete")).toBe(false);
    expect(can("EDITOR", "photo.deleteAny")).toBe(false);
  });

  it("keeps visitors read-only", () => {
    for (const a of ["frame.place", "frame.edit", "frame.delete", "photo.upload", "photo.deleteOwn", "invitation.manage", "room.edit"] as const) {
      expect(can("VISITOR", a)).toBe(false);
    }
    expect(can("VISITOR", "museum.view")).toBe(true);
  });

  it("respects the owner's look-together setting for visitors only", () => {
    expect(can("VISITOR", "shared.start", { guestsCanStartSharedViewing: false })).toBe(false);
    expect(can("VISITOR", "shared.start", { guestsCanStartSharedViewing: true })).toBe(true);
    expect(can("EDITOR", "shared.start", { guestsCanStartSharedViewing: false })).toBe(true);
  });

  it("denies everything without a role", () => {
    expect(can(null, "museum.view")).toBe(false);
  });
});
