import { expect, test } from "@playwright/test";
import { player, prepare, waitForMuseum } from "./helpers";

test.beforeEach(async ({ context }) => {
  await prepare(context);
});

test("phones get touch controls and a compact menu", async ({ page }) => {
  await page.goto("/demo");
  await waitForMuseum(page);
  await expect(page.getByTestId("mobile-controls")).toBeVisible();
  await expect(page.getByTestId("hud-more")).toBeVisible();

  // Push the joystick forward.
  const stick = page.getByTestId("joystick");
  const box = (await stick.boundingBox())!;
  const start = await player(page);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + 4, { steps: 4 });
  await expect
    .poll(async () => {
      const p = await player(page);
      return Math.hypot(p.x - start.x, p.z - start.z);
    }, { timeout: 20_000 })
    .toBeGreaterThan(0.4);
  await page.mouse.up();

  // Secondary actions live in the menu.
  await page.getByTestId("hud-more").click();
  await page.getByTestId("hud-settings").click();
  await expect(page.getByRole("dialog")).toBeVisible();
});
