import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { createMuseum, quietContext, signUp, uploadAndHang, waitForMuseum } from "./helpers";

async function expectAccessible(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"]).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html.slice(0, 160)).join(" | ")}`)).toEqual([]);
}

/** Chromium's fake microphone (a steady beep) stands in for a voice. */
test("record a narration for a tour stop and hear it on the tour", async ({ browser }) => {
  const ctx = await quietContext(browser, { permissions: ["microphone"] });
  const page = await ctx.newPage();
  await signUp(page, "Narrator");
  const museumId = await createMuseum(page, "Told aloud");
  await uploadAndHang(page, museumId, 2);

  // A new tour needs saving before its stops can be narrated.
  await page.goto(`/editor/${museumId}?tab=tours`);
  await page.getByTestId("tour-new").click();
  await page.getByTestId("tour-name").fill("Listen along");
  await page.getByTestId("tour-add-frame").nth(0).click();
  await page.getByTestId("tour-add-frame").nth(1).click();
  await expect(page.getByTestId("narration-save-first")).toHaveCount(2);
  await page.getByTestId("tour-save").click();
  await page.getByTestId("tour-edit").click();

  const first = page.getByTestId("narration").first();
  await first.getByTestId("narration-record").click();
  await expect(first.getByTestId("narration-recording")).toBeVisible();
  await page.waitForTimeout(2_500);
  await first.getByTestId("narration-stop").click();
  await expect(first.getByTestId("narration-preview")).toBeVisible();
  await first.getByTestId("narration-save").click();
  await expect(first).toHaveAttribute("data-has-narration", "true");
  await expect(first.getByTestId("narration-current")).toBeVisible();
  await expect(page.getByTestId("narration").nth(1)).toHaveAttribute("data-has-narration", "false");
  await expectAccessible(page);

  // Visitors see the tour is narrated; it plays on arrival at the stop.
  await page.goto(`/museum/${museumId}`);
  await waitForMuseum(page);
  await page.getByTestId("hud-tours").click();
  await expect(page.getByTestId("tour-narrated")).toBeVisible();
  await page.getByTestId("tour-start").click();
  const narration = page.getByTestId("tour-narration");
  await expect(narration).toHaveAttribute("data-state", "playing");
  // The recording really decodes and plays (time advances), then can be paused.
  await expect.poll(() => narration.locator("audio").evaluate((a: HTMLAudioElement) => a.currentTime), { timeout: 10_000 }).toBeGreaterThan(0.3);
  await page.getByTestId("tour-narration-toggle").click();
  await expect(narration).toHaveAttribute("data-state", "paused");
  await expectAccessible(page);

  // The next stop has no narration.
  await page.getByTestId("tour-next").click();
  await expect(page.getByTestId("tour-card")).toHaveAttribute("data-index", "1");
  await expect(narration).toHaveCount(0);
  await ctx.close();
});
