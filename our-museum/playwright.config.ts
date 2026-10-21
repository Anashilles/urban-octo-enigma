import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests against a running app + realtime service.
 *
 *   npm run test:e2e            # starts `npm run dev` and `npm run realtime` if needed
 *   E2E_BASE_URL=https://… npm run test:e2e   # against an existing deployment
 *
 * The app must run with NEXT_PUBLIC_ENABLE_TEST_HOOKS=true (read-only scene
 * hooks), AUTH_REQUIRE_EMAIL_VERIFICATION=false and AUTH_RATE_LIMIT=off.
 * WebGL runs in software (SwiftShader) in headless Chromium, so 3D steps are slow.
 */
const swiftshader = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"];

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 20_000 },
  // No retries: a flaky test should fail loudly rather than pass on a second try.
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: { args: swiftshader, executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1100, height: 700 } }, testIgnore: /mobile\.spec/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec/ },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : [
        { command: "npm run dev", url: "http://localhost:3000/api/health", reuseExistingServer: true, timeout: 240_000 },
        { command: "npm run realtime", url: "http://localhost:4001/health", reuseExistingServer: true, timeout: 60_000 },
      ],
});
