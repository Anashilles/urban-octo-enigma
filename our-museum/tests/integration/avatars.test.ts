import { beforeEach, describe, expect, it } from "vitest";
import { defaultAvatar, randomAvatar, seededRandom } from "@/features/avatars/config";
import { prisma } from "@/lib/database/prisma";
import { getAvatar, getAvatars, saveAvatar } from "@/services/avatar-service";
import { createMuseum } from "@/services/museum-service";
import { getScene } from "@/services/scene-service";
import { createUser, resetDatabase } from "../helpers/factories";

describe("avatars", () => {
  beforeEach(resetDatabase);

  it("returns a seeded default until the user saves their own", async () => {
    const user = await createUser();
    const before = await getAvatar(user.id);
    expect(before.saved).toBe(false);
    expect(before.config).toEqual(defaultAvatar(user.id));

    const mine = randomAvatar(seededRandom("mine"));
    const saved = await saveAvatar(user.id, mine);
    expect(saved).toMatchObject({ saved: true, config: mine });
    expect((await getAvatar(user.id)).config).toEqual(mine);
    expect(await prisma.avatarProfile.count({ where: { userId: user.id } })).toBe(1);

    // Saving again updates the same row.
    await saveAvatar(user.id, { ...mine, hairStyle: "bun" });
    expect((await getAvatar(user.id)).config.hairStyle).toBe("bun");
    expect(await prisma.avatarProfile.count({ where: { userId: user.id } })).toBe(1);
  });

  it("rejects invalid configs without touching the stored avatar", async () => {
    const user = await createUser();
    const good = randomAvatar(seededRandom("good"));
    await saveAvatar(user.id, good);
    await expect(saveAvatar(user.id, { ...good, skinTone: "javascript:alert(1)" })).rejects.toThrow();
    await expect(saveAvatar(user.id, { ...good, script: "<b>" })).rejects.toThrow();
    expect((await getAvatar(user.id)).config).toEqual(good);
  });

  it("loads avatars for several users and includes the viewer's avatar in the scene", async () => {
    const a = await createUser();
    const b = await createUser();
    const look = randomAvatar(seededRandom("a"));
    await saveAvatar(a.id, look);
    const map = await getAvatars([a.id, b.id, a.id]);
    expect(map.get(a.id)).toEqual(look);
    expect(map.get(b.id)).toEqual(defaultAvatar(b.id));

    const museum = await createMuseum(a, { name: "Ours", description: "", templateId: "warm-romantic" }, "en");
    const scene = await getScene(a, museum.id);
    expect(scene.viewer.avatar).toEqual(look);
  });

  it("is removed with the account", async () => {
    const user = await createUser();
    await saveAvatar(user.id, randomAvatar(seededRandom("gone")));
    await prisma.user.delete({ where: { id: user.id } });
    expect(await prisma.avatarProfile.count()).toBe(0);
  });
});
