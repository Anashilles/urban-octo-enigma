import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { createMuseum, playerAtRest, quietContext, signUp, testJpeg, uploadAndHang, waitForMuseum } from "./helpers";

type Frame = { id: string; photoId: string };
const frames = (page: Page) => page.evaluate(() => (window as unknown as { __museum: { frames: () => Frame[] } }).__museum.frames());

/** Turns on the spot until the placement preview finds a free piece of wall. */
async function aimAtFreeWall(page: Page) {
  for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2, Math.PI / 4, -Math.PI / 4, (3 * Math.PI) / 4, (-3 * Math.PI) / 4]) {
    await page.evaluate((y) => {
      const m = (window as unknown as { __museum: { player: () => { x: number; z: number }; teleport: (x: number, z: number, yaw: number) => void } }).__museum;
      const p = m.player();
      m.teleport(p.x, p.z, y);
    }, yaw);
    await playerAtRest(page);
    try {
      await expect(page.getByTestId("placement-status")).toHaveAttribute("data-valid", "true", { timeout: 4_000 });
      return;
    } catch {
      // Not a free spot this way; try the next direction.
    }
  }
  throw new Error("No free wall in view");
}

test("add a photo from the device inside the museum, hang it, and change a frame's picture", async ({ browser }) => {
  // Two uploads and processing on top of a 3D museum in software WebGL.
  test.slow();
  const ctx = await quietContext(browser);
  const page = await ctx.newPage();
  await signUp(page, "Hanger");
  const museumId = await createMuseum(page, "From my phone");
  await uploadAndHang(page, museumId, 1);
  await page.goto(`/museum/${museumId}`);
  await waitForMuseum(page);
  await expect.poll(async () => (await frames(page)).length).toBe(1);

  // Upload from the photos panel; placement starts straight away.
  await page.getByTestId("hud-photos").click();
  await page.getByTestId("photos-panel").getByTestId("device-photo-input").setInputFiles({ name: "from-my-phone.jpg", mimeType: "image/jpeg", buffer: await testJpeg(120) });
  await expect(page.getByTestId("placement-bar")).toBeVisible({ timeout: 60_000 });
  await aimAtFreeWall(page);
  await page.getByTestId("placement-confirm").click();
  await expect(page.getByTestId("placement-bar")).toBeHidden({ timeout: 20_000 });
  await expect.poll(async () => (await frames(page)).length).toBe(2);
  const [first, second] = await frames(page);
  expect(first!.photoId).not.toBe(second!.photoId);

  // Change the picture in the first frame to the one just uploaded.
  await page.getByTestId("hud-photos").click();
  await page.getByTestId("photo-view").first().click();
  await expect(page.getByTestId("photo-viewer")).toBeVisible();
  await page.getByTestId("change-picture").click();
  const dialog = page.getByTestId("change-picture-dialog");
  await expect(dialog.getByTestId("change-picture-option")).toHaveCount(2);
  const { violations } = await new AxeBuilder({ page }).include("[data-testid=change-picture-dialog]").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"]).analyze();
  expect(violations.map((v) => v.id)).toEqual([]);
  await dialog.locator("[data-testid=change-picture-option]:not([aria-current])").click();
  await expect(dialog).toBeHidden({ timeout: 20_000 });
  await expect.poll(async () => (await frames(page)).find((f) => f.id === first!.id)?.photoId).toBe(second!.photoId);

  // …and from the device, straight into the frame.
  await page.getByTestId("change-picture").click();
  await dialog.getByTestId("device-photo-input").setInputFiles({ name: "another.jpg", mimeType: "image/jpeg", buffer: await testJpeg(200) });
  await expect(dialog).toBeHidden({ timeout: 60_000 });
  await expect.poll(async () => (await frames(page)).find((f) => f.id === first!.id)?.photoId).not.toBe(second!.photoId);
  expect(await frames(page)).toHaveLength(2);
  await ctx.close();
});
