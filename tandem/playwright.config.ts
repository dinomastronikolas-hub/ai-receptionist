import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests. `npm run test:e2e` (scripts/e2e.sh) prepares a database,
 * starts the test-only Supabase stand-in and a production build of the app.
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    ...devices["iPhone 13"],
    browserName: "chromium",
    timezoneId: "America/New_York",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {},
    trace: "retain-on-failure",
  },
});
