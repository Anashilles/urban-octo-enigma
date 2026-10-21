import { expect, test } from "@playwright/test";
import { player, playerAtRest, prepare, waitForMuseum } from "./helpers";

test.beforeEach(async ({ context }) => {
  await prepare(context);
});

test("landing page switches to Arabic with right-to-left layout", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(page.locator("h1")).toBeVisible();
  await page.getByTestId("language-switcher").click();
  await page.getByTestId("locale-ar").click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await page.getByTestId("language-switcher").click();
  await page.getByTestId("locale-en").click();
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
});

test("demo museum: walk with the keyboard, open a photograph and close it", async ({ page }) => {
  await page.goto("/demo");
  await waitForMuseum(page);
  const start = await player(page);
  // Hold W until the visitor has walked (software WebGL can be slow to start).
  await page.keyboard.down("KeyW");
  await expect
    .poll(async () => {
      const p = await player(page);
      return Math.hypot(p.x - start.x, p.z - start.z);
    }, { timeout: 20_000 })
    .toBeGreaterThan(0.5);
  await page.keyboard.up("KeyW");

  // Walk up to a photograph and open it with E.
  await page.getByTestId("hud-photos").click();
  await page.getByTestId("photo-goto").first().click();
  // Focus moves straight to the scene, so keys work even while the panel slides away.
  await expect(page.getByTestId("museum-canvas")).toBeFocused();
  await page.waitForFunction(() => (window as unknown as { __museum: { focused: () => string | null } }).__museum.focused() !== null, undefined, { timeout: 30_000 });
  await page.keyboard.press("e");
  const viewer = page.getByTestId("photo-viewer");
  await expect(viewer).toBeVisible();

  // Movement keys don't move the visitor while the viewer is open; arrows browse instead.
  const before = await playerAtRest(page);
  const title = await page.getByTestId("viewer-title").textContent();
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(700);
  await page.keyboard.up("KeyW");
  const after = await player(page);
  expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeLessThan(0.01);
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("viewer-title")).not.toHaveText(title ?? "");

  await page.keyboard.press("Escape");
  await expect(viewer).toBeHidden();
});

test("demo museum: guided tour from start to finish", async ({ page }) => {
  await page.goto("/demo");
  await waitForMuseum(page);
  await page.getByTestId("hud-tours").click();
  await page.getByTestId("tour-start").first().click();
  const card = page.getByTestId("tour-card");
  await expect(card).toHaveAttribute("data-index", "0");
  while (await page.getByTestId("tour-next").count()) {
    const index = Number(await card.getAttribute("data-index"));
    await page.getByTestId("tour-next").click();
    await expect(card).toHaveAttribute("data-index", String(index + 1));
  }
  await page.getByTestId("tour-finish").click();
  await expect(card).toBeHidden();
});

test("without WebGL the museum offers an accessible list instead", async ({ page }) => {
  await page.goto("/demo?webgl=0");
  await expect(page.getByTestId("webgl-fallback")).toBeVisible({ timeout: 60_000 });
});
