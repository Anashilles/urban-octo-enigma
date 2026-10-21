import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { createMuseum, quietContext, signUp, uploadAndHang, waitForMuseum } from "./helpers";

async function expectAccessible(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"]).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html.slice(0, 160)).join(" | ")}`)).toEqual([]);
}

async function openFirstPhoto(page: Page) {
  await page.getByTestId("hud-photos").click();
  await page.getByTestId("photo-view").first().click();
  await expect(page.getByTestId("photo-viewer")).toBeVisible();
}

test("comments and the guestbook, live between two people", async ({ browser }) => {
  const ownerCtx = await quietContext(browser);
  const owner = await ownerCtx.newPage();
  await signUp(owner, "Owner");
  const museumId = await createMuseum(owner, "Notes");
  await uploadAndHang(owner, museumId, 2);
  const invite = await owner.evaluate(
    async (id) => (await fetch(`/api/museums/${id}/invitations`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ role: "VISITOR", maxUses: 1 }) })).json(),
    museumId,
  );
  await owner.goto(`/museum/${museumId}`);
  await waitForMuseum(owner);

  const guestCtx = await quietContext(browser);
  const guest = await guestCtx.newPage();
  await guest.goto(invite.url);
  await guest.getByTestId("guest-name").fill("Salma");
  await guest.getByTestId("guest-join").click();
  await guest.waitForURL(`**/museum/${museumId}`);
  await waitForMuseum(guest);
  await expect(owner.getByTestId("presence-button")).toHaveAttribute("data-count", "1");

  // Both look at the first photograph with comments open.
  await openFirstPhoto(owner);
  await owner.getByTestId("comments-toggle").click();
  await expect(owner.getByTestId("comments-panel")).toContainText(/No comments yet/);
  await openFirstPhoto(guest);
  const title = await guest.getByTestId("viewer-title").textContent();
  await guest.getByTestId("comments-toggle").click();

  // Typing (including arrow keys) stays in the box instead of changing photo.
  const input = guest.getByTestId("comment-input");
  await input.fill("I remember this day");
  await input.press("ArrowLeft");
  await expect(guest.getByTestId("viewer-title")).toHaveText(title ?? "");
  await input.press("Control+Enter");
  await expect(guest.getByTestId("comments-list").getByTestId("note-body")).toHaveText(["I remember this day"]);
  await expect(input).toHaveValue("");

  // It reaches the owner without a reload, with the guest's name and badge.
  await expect(owner.getByTestId("comments-list").getByTestId("note-body")).toHaveText(["I remember this day"], { timeout: 20_000 });
  await expect(owner.getByTestId("comments-list").getByTestId("note")).toContainText("Salma");
  await expect(owner.getByTestId("comments-list").getByTestId("note")).toContainText("Guest");
  await expect(owner.getByTestId("comments-toggle")).toContainText("1");
  await expectAccessible(owner);

  // The owner moderates: removing it updates the guest too.
  await owner.getByTestId("note-delete").click();
  await owner.getByTestId("note-delete-confirm").click();
  await expect(owner.getByTestId("comments-list")).toHaveCount(0);
  await expect(guest.getByTestId("comments-panel")).toContainText(/No comments yet/, { timeout: 20_000 });

  // Escape closes the comments first, then the viewer.
  await guest.keyboard.press("Escape");
  await expect(guest.getByTestId("comments-panel")).toBeHidden();
  await expect(guest.getByTestId("photo-viewer")).toBeVisible();
  await guest.keyboard.press("Escape");
  await expect(guest.getByTestId("photo-viewer")).toBeHidden();
  await owner.keyboard.press("Escape");
  await owner.keyboard.press("Escape");

  // The guestbook.
  await guest.getByTestId("hud-guestbook").click();
  await guest.getByTestId("guestbook-input").fill("Thank you for inviting me ♥");
  await guest.getByTestId("guestbook-submit").click();
  await expect(guest.getByTestId("guestbook-list").getByTestId("note-body")).toHaveText(["Thank you for inviting me ♥"]);
  await owner.getByTestId("hud-guestbook").click();
  await expect(owner.getByTestId("guestbook-list").getByTestId("note-body")).toHaveText(["Thank you for inviting me ♥"]);
  await expectAccessible(owner);

  await Promise.all([ownerCtx.close(), guestCtx.close()]);
});
