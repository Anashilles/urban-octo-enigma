import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import sharp from "sharp";

export const PASSWORD = "correct horse battery";

/** Lighter rendering and no first-visit tutorial, so 3D steps run fast in CI. */
export async function prepare(ctx: BrowserContext) {
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem("om-preferences", JSON.stringify({ state: { tutorialSeen: true, graphicsQuality: "low" }, version: 1 }));
    } catch {
      // Storage may be unavailable; the app falls back to defaults.
    }
  });
  return ctx;
}

export async function quietContext(browser: Browser, opts: Parameters<Browser["newContext"]>[0] = {}): Promise<BrowserContext> {
  return prepare(await browser.newContext(opts));
}

export function uniqueEmail(prefix: string) {
  return `${prefix}+${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@example.com`;
}

export async function signUp(page: Page, name: string, email = uniqueEmail(name.toLowerCase())) {
  await page.goto("/signup");
  await page.fill("#displayName", name);
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.fill("#confirmPassword", PASSWORD);
  await page.getByTestId("signup-form").locator("button[type=submit]").click();
  await page.waitForURL("**/dashboard", { timeout: 60_000 });
  return email;
}

export async function createMuseum(page: Page, name: string) {
  await page.goto("/museums/new");
  await page.fill("#name", name);
  await page.getByTestId("create-museum-submit").click();
  await page.waitForURL(/\/editor\/[^/?]+/, { timeout: 60_000 });
  return new URL(page.url()).pathname.split("/")[2]!;
}

export async function waitForMuseum(page: Page) {
  await expect(page.getByTestId("museum-experience")).toBeVisible({ timeout: 90_000 });
  // The render loop reports the current room once it is running (first frames compile shaders).
  await page.waitForFunction(() => Boolean((window as unknown as { __museum?: { currentRoom: () => string | null } }).__museum?.currentRoom()), undefined, {
    timeout: 120_000,
  });
}

export function player(page: Page) {
  return page.evaluate(() => (window as unknown as { __museum: { player: () => { x: number; z: number; yaw: number; moving: boolean } } }).__museum.player());
}

/**
 * Resolves once the visitor has stopped moving: any glide (Go to photo, tours)
 * has finished and the position is stable. With software WebGL a single frame
 * can take hundreds of milliseconds, so a glide may still be finishing after
 * the photo viewer has appeared.
 */
export async function playerAtRest(page: Page) {
  let last = await player(page);
  await expect
    .poll(
      async () => {
        const p = await player(page);
        const moved = Math.hypot(p.x - last.x, p.z - last.z);
        last = p;
        return p.moving ? 1 : moved;
      },
      { timeout: 20_000, intervals: [250] },
    )
    .toBeLessThan(0.001);
  return last;
}

export async function testJpeg(hue: number) {
  // A generated test image — never a real photograph.
  return sharp({ create: { width: 900, height: 600, channels: 3, background: { r: 60 + hue, g: 120, b: 200 - hue } } })
    .jpeg({ quality: 85 })
    .toBuffer();
}

/** Uploads generated images in the editor and hangs each with "Add to wall". */
export async function uploadAndHang(page: Page, museumId: string, count: number) {
  for (let i = 0; i < count; i++) {
    await page.getByTestId("file-input").setInputFiles({ name: `generated-${i}.jpg`, mimeType: "image/jpeg", buffer: await testJpeg(i * 40) });
    await expect(page.getByTestId("photo-tile")).toHaveCount(i + 1, { timeout: 90_000 });
  }
  await page.goto(`/editor/${museumId}?tab=walls`);
  for (let i = 0; i < count; i++) {
    // Select a photo in the library, then hang it on the current wall.
    await page.getByTestId("library-photo").nth(i).click();
    await page.getByTestId("add-to-wall").click();
    await expect(page.getByTestId("frame-properties")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("save-status")).toHaveAttribute("data-state", "saved", { timeout: 30_000 });
  }
}

