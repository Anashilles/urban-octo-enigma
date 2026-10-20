import { expect, test, type Page } from "@playwright/test";
import { createMuseum, prepare, signUp, uploadAndHang, waitForMuseum } from "./helpers";

const frames = (page: Page) => page.evaluate(() => (window as unknown as { __museum: { frames: () => unknown[] } }).__museum.frames().length);

test("create a museum, upload photos, hang them and find them in 3D after a reload", async ({ page, context, browser }) => {
  await prepare(context);
  await signUp(page, "Mira");
  const museumId = await createMuseum(page, "E2E Museum");
  await uploadAndHang(page, museumId, 2);

  await page.goto(`/museum/${museumId}`);
  await waitForMuseum(page);
  await expect.poll(() => frames(page)).toBe(2);
  await page.reload();
  await waitForMuseum(page);
  await expect.poll(() => frames(page)).toBe(2);

  // Photos are only reachable through short-lived signed URLs.
  const scene = await page.evaluate(async (id) => (await fetch(`/api/museums/${id}/scene`)).json(), museumId);
  const url: string = scene.photos[0].urls.large;
  expect((await page.request.get(url)).status()).toBe(200);
  expect((await page.request.get(url.replace(/s=[^&]+/, "s=forged"))).status()).toBe(403);
  expect((await page.request.get(url.replace(/e=\d+/, "e=9999999999"))).status()).toBe(403);

  // Strangers and signed-out visitors can't see the museum at all.
  const anon = await browser.newContext();
  expect((await anon.request.get(`/api/museums/${museumId}/scene`)).status()).toBe(401);
  const strangerPage = await anon.newPage();
  await signUp(strangerPage, "Stranger");
  expect((await strangerPage.request.get(`/api/museums/${museumId}/scene`)).status()).toBe(404);
  const visit = await strangerPage.goto(`/museum/${museumId}`);
  expect(visit?.status()).toBe(404);
  await anon.close();
});

test("an avatar can be customised and saved", async ({ page, context }) => {
  await prepare(context);
  await signUp(page, "Ava");
  await page.goto("/avatar");
  await expect(page.getByTestId("avatar-stage")).toBeVisible({ timeout: 60_000 });
  await page.getByTestId("avatar-tab-hair").click();
  await page.getByTestId("avatar-hairStyle-curly").click();
  await page.getByTestId("avatar-save").click();
  await expect(page.getByTestId("avatar-save")).toBeDisabled();
  const saved = await page.evaluate(async () => (await fetch("/api/me/avatar")).json());
  expect(saved).toMatchObject({ saved: true, config: { hairStyle: "curly" } });
});
