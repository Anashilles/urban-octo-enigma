import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { unzipSync } from "fflate";
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
  const put = page.waitForResponse((r) => r.url().endsWith("/api/me/avatar") && r.request().method() === "PUT");
  await page.getByTestId("avatar-save").click();
  expect((await put).ok()).toBe(true);
  await expect(page.getByTestId("avatar-save")).toBeDisabled();
  const saved = await page.evaluate(async () => (await fetch("/api/me/avatar")).json());
  expect(saved).toMatchObject({ saved: true, config: { hairStyle: "curly" } });
});

test("frame edits: quick nudges save in order, and someone else's change is never overwritten", async ({ page, context }) => {
  await prepare(context);
  await signUp(page, "Noor");
  const museumId = await createMuseum(page, "Edits");
  await uploadAndHang(page, museumId, 1);
  const serverFrame = () =>
    page.evaluate(async (id) => (await (await fetch(`/api/museums/${id}/scene`)).json()).frames[0] as { id: string; u: number; v: number; version: number }, museumId);
  const start = await serverFrame();

  // Six quick arrow presses: each save waits for the previous one, so none collide.
  // On a slowed-down CPU presses arrive before the editor re-renders; none may be lost.
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 6 });
  await page.getByTestId("wall-elevation").locator("svg").first().focus();
  for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("save-status")).toHaveAttribute("data-state", "saved", { timeout: 60_000 });
  await expect.poll(async () => (await serverFrame()).u, { timeout: 30_000 }).toBeCloseTo(start.u + 0.3, 3);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  await expect(page.locator("[data-sonner-toast][data-type=error]")).toHaveCount(0);

  // Another editor moves the frame (this page has not seen it yet)…
  const current = await serverFrame();
  const other = await page.evaluate(
    async ({ id, frame }) =>
      (await fetch(`/api/museums/${id}/frames/${frame.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ v: frame.v - 0.1, expectedVersion: frame.version }) })).status,
    { id: museumId, frame: current },
  );
  expect(other).toBe(200);

  // …so this page's next nudge is refused instead of silently moving it back.
  await page.getByTestId("wall-elevation").locator("svg").first().focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: "Someone else just changed this frame" })).toBeVisible({ timeout: 30_000 });
  expect(await serverFrame()).toMatchObject({ u: current.u, v: current.v - 0.1 });
  // The editor reloaded their version; editing continues from it.
  await page.getByTestId("wall-elevation").locator("svg").first().focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => (await serverFrame()).u).toBeCloseTo(current.u + 0.05, 3);
  expect((await serverFrame()).v).toBeCloseTo(current.v - 0.1, 3);
});

test("the owner downloads the museum and the copy opens offline", async ({ page, context }, testInfo) => {
  await prepare(context);
  await signUp(page, "Archivist");
  const museumId = await createMuseum(page, "Keepsake");
  await uploadAndHang(page, museumId, 2);
  await page.goto(`/editor/${museumId}?tab=settings`);
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-museum").click()]);
  expect(download.suggestedFilename()).toMatch(/^our-museum-keepsake-\d{4}-\d{2}-\d{2}\.zip$/);
  const files = unzipSync(new Uint8Array(await readFile(await download.path())));
  expect(Object.keys(files).filter((n) => n.startsWith("photos/"))).toHaveLength(2);

  // Unpack and open the offline page straight from disk.
  const dir = testInfo.outputPath("export");
  for (const [name, bytes] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(dir, name)), { recursive: true });
    await writeFile(path.join(dir, name), bytes);
  }
  const offline = await context.newPage();
  await offline.goto(pathToFileURL(path.join(dir, "index.html")).href);
  await expect(offline.getByRole("heading", { level: 1 })).toHaveText("Keepsake");
  const images = offline.locator("figure img");
  await expect(images).toHaveCount(2);
  await expect.poll(() => images.evaluateAll((list) => list.every((img) => (img as HTMLImageElement).naturalWidth > 0))).toBe(true);
});
