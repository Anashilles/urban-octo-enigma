import { expect, test, type Page } from "@playwright/test";
import { createMuseum, quietContext, signUp, waitForMuseum } from "./helpers";

/**
 * Voice through a TURN relay. Opt-in: needs a TURN server and the app running
 * with TURN_URLS, TURN_SHARED_SECRET and VOICE_RELAY_ONLY=true (see
 * docs/DEPLOYMENT.md#voice-chat-and-turn), then E2E_EXPECT_RELAY=1.
 */
test.skip(!process.env.E2E_EXPECT_RELAY, "set E2E_EXPECT_RELAY=1 with a TURN server configured");

type Live = { voice: () => { status: string; connected: Record<string, string> }; voiceRoutes: () => Promise<Array<{ local: string; remote: string }>> };
async function joinVoice(page: Page) {
  await page.getByTestId("voice-button").click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __live: Live }).__live.voice().status), { timeout: 30_000 }).toBe("on");
}

test("voice connects only through the TURN relay", async ({ browser }) => {
  const ownerCtx = await quietContext(browser);
  const owner = await ownerCtx.newPage();
  await signUp(owner, "Owner");
  const museumId = await createMuseum(owner, "Relay");
  const invite = await owner.evaluate(
    async (id) => (await fetch(`/api/museums/${id}/invitations`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ role: "VISITOR", maxUses: 1 }) })).json(),
    museumId,
  );
  const ice = await owner.evaluate(async () => (await fetch("/api/realtime/ice")).json());
  expect(ice).toMatchObject({ relay: true, iceTransportPolicy: "relay" });

  await owner.goto(`/museum/${museumId}`);
  await waitForMuseum(owner);
  const guestCtx = await quietContext(browser);
  const guest = await guestCtx.newPage();
  await guest.goto(invite.url);
  await guest.getByTestId("guest-name").fill("Relay guest");
  await guest.getByTestId("guest-join").click();
  await guest.waitForURL(`**/museum/${museumId}`);
  await waitForMuseum(guest);
  await expect(owner.getByTestId("presence-button")).toHaveAttribute("data-count", "1");

  await joinVoice(owner);
  await joinVoice(guest);

  for (const page of [owner, guest]) {
    await expect
      .poll(() => page.evaluate(() => Object.values((window as unknown as { __live: Live }).__live.voice().connected)), { timeout: 60_000 })
      .toEqual(["connected"]);
    // Both ends of the selected candidate pair are relay candidates: no direct path, no addresses exchanged.
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __live: Live }).__live.voiceRoutes()), { timeout: 30_000 })
      .toEqual([expect.objectContaining({ local: "relay", remote: "relay" })]);
  }

  await Promise.all([ownerCtx.close(), guestCtx.close()]);
});
