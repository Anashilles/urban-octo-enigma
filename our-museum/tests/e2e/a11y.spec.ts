import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { createMuseum, prepare, signUp, waitForMuseum } from "./helpers";

/**
 * Automated accessibility checks (axe-core: WCAG 2.1 A/AA and best practices)
 * on the main pages and museum states, in English and Arabic. Automated rules
 * catch only part of what matters; they complement manual testing.
 */
/**
 * Panels and dialogs fade and slide in; measured mid-animation, half-transparent
 * text fails contrast that the open panel passes. Wait until they have settled.
 */
async function panelsSettled(page: Page) {
  await page.waitForFunction(
    () =>
      document.getAnimations().every((a) => {
        const target = (a.effect as KeyframeEffect | null)?.target;
        return a.playState !== "running" || !(target instanceof Element) || !target.closest("[role=dialog],[data-hud-panel],[data-slot=sheet-overlay],[data-slot=dialog-overlay]");
      }),
    undefined,
    { timeout: 15_000 },
  );
}

async function expectNoViolations(page: Page, state: string) {
  await panelsSettled(page);
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"]).analyze();
  const summary = violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`);
  expect(summary, `axe violations on ${state}`).toEqual([]);
}

for (const locale of ["en", "ar"] as const) {
  test(`pages and museum states have no axe violations (${locale})`, async ({ page, context, baseURL }) => {
    await prepare(context);
    await context.addCookies([{ name: "om_locale", value: locale, url: baseURL! }]);

    for (const path of ["/", "/login", "/signup", "/invite", "/privacy"]) {
      await page.goto(path);
      await expectNoViolations(page, path);
    }

    await page.goto("/demo");
    await waitForMuseum(page);
    await expectNoViolations(page, "/demo");
    for (const panel of ["hud-photos", "hud-tours", "hud-settings", "hud-help"]) {
      await page.getByTestId(panel).click();
      await expectNoViolations(page, `/demo ${panel}`);
      await page.keyboard.press("Escape");
    }
    // The photo viewer.
    await page.getByTestId("hud-photos").click();
    await page.getByTestId("photo-view").first().click();
    await expect(page.getByTestId("photo-viewer")).toBeVisible();
    await expectNoViolations(page, "/demo photo viewer");
    await page.keyboard.press("Escape");

    await signUp(page, `A11y${locale}`);
    await expectNoViolations(page, "/dashboard");
    const museumId = await createMuseum(page, "A11y");
    for (const tab of ["photos", "walls", "rooms", "appearance", "tours", "people", "settings"]) {
      await page.goto(`/editor/${museumId}?tab=${tab}`);
      await expect(page.getByTestId(`editor-tab-${tab}`)).toHaveAttribute("aria-selected", "true");
      await expectNoViolations(page, `editor ${tab}`);
    }
    for (const path of ["/avatar", "/settings", "/museums/new"]) {
      await page.goto(path);
      await expectNoViolations(page, path);
    }
  });
}

test("editor tabs work with the arrow keys", async ({ page, context }) => {
  await prepare(context);
  await signUp(page, "Keys");
  await createMuseum(page, "Keys");
  await page.getByTestId("editor-tab-photos").focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("editor-tab-walls")).toBeFocused();
  await expect(page.getByTestId("editor-tab-walls")).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("End");
  await expect(page.getByTestId("editor-tab-settings")).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Home");
  await expect(page.getByTestId("editor-tab-photos")).toBeFocused();
});
