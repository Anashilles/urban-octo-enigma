import { expect, test } from "@playwright/test";
import { createMuseum, quietContext, signUp, uploadAndHang, waitForMuseum } from "./helpers";

test("invite a guest, see each other, and look at photographs together", async ({ browser }) => {
  // Two museums render in software WebGL at once; on CI runners this takes about twice as long as locally.
  test.slow();
  const ownerCtx = await quietContext(browser);
  const owner = await ownerCtx.newPage();
  await signUp(owner, "Owner");
  const museumId = await createMuseum(owner, "Together");
  await uploadAndHang(owner, museumId, 2);
  const invite = await owner.evaluate(
    async (id) => (await fetch(`/api/museums/${id}/invitations`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ role: "VISITOR", maxUses: 3 }) })).json(),
    museumId,
  );
  expect(invite.url).toMatch(/\/invite\/[A-Za-z0-9_-]{43}$/);

  await owner.goto(`/museum/${museumId}`);
  await waitForMuseum(owner);
  await expect(owner.getByTestId("presence-button")).toHaveAttribute("data-status", "online");

  // The guest joins with just a name.
  const guestCtx = await quietContext(browser);
  const guest = await guestCtx.newPage();
  await guest.goto(invite.url);
  await guest.getByTestId("guest-name").fill("Layla");
  await guest.getByTestId("guest-join").click();
  await guest.waitForURL(`**/museum/${museumId}`);
  await waitForMuseum(guest);
  await expect(guest.getByTestId("presence-button")).toHaveAttribute("data-count", "1");
  await expect(owner.getByTestId("presence-button")).toHaveAttribute("data-count", "1");

  // Look Together: the owner opens a photograph for both.
  await owner.getByTestId("hud-photos").click();
  await owner.getByTestId("photo-view").first().click();
  const first = await owner.getByTestId("viewer-title").textContent();
  await owner.getByTestId("look-together").click();
  // Browsing on at once, before the server has confirmed the shared view, still takes the guest along.
  await owner.getByTestId("viewer-next").click();
  await expect(owner.getByTestId("viewer-title")).not.toHaveText(first ?? "");
  await expect(guest.getByTestId("viewer-shared-bar")).toBeVisible();
  await expect(guest.getByTestId("viewer-title")).toHaveText((await owner.getByTestId("viewer-title").textContent()) ?? "");
  await owner.getByTestId("viewer-prev").click();
  await expect(guest.getByTestId("viewer-title")).toHaveText(first ?? "");
  // Followers can't steer.
  await expect(guest.getByTestId("viewer-next")).toHaveCount(0);
  await owner.getByTestId("shared-leave").click();
  await expect(guest.getByTestId("photo-viewer")).toBeHidden();

  // Revoking the link stops it working immediately.
  const { invitations } = await owner.evaluate(async (id) => (await fetch(`/api/museums/${id}/invitations`)).json(), museumId);
  await owner.evaluate(
    async ([id, inv]) => {
      await fetch(`/api/museums/${id}/invitations/${inv}`, { method: "DELETE" });
    },
    [museumId, invitations[0].id] as const,
  );
  const lateCtx = await quietContext(browser);
  const late = await lateCtx.newPage();
  await late.goto(invite.url);
  await expect(late.getByTestId("invitation-unavailable")).toHaveAttribute("data-status", "revoked");

  await Promise.all([ownerCtx.close(), guestCtx.close(), lateCtx.close()]);
});
