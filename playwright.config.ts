import { defineConfig, devices } from "@playwright/test";

/**
 * Critical-flow E2E (P0) against an ephemeral PocketBase.
 *
 *  1. Start an empty PocketBase on :8091 (or set PB_URL):
 *       ./pocketbase serve --http 127.0.0.1:8091
 *  2. Seed it:
 *       PB_URL=http://127.0.0.1:8091 PB_SUPERUSER_EMAIL=... PB_SUPERUSER_PASSWORD=... \
 *       node scripts/setup-pocketbase.js
 *  3. Run the app against that PB, then:
 *       PB_URL=http://127.0.0.1:8091 APP_URL=http://127.0.0.1:5173 \
 *       E2E_ADMIN_EMAIL=adminopk@mail.com E2E_ADMIN_PASSWORD=... \
 *       npm run test:e2e
 *
 * Specs skip gracefully when PB/APP URLs are unreachable so `npm run test:e2e`
 * never fails closed on a dev laptop without the ephemeral stack.
 */
const APP_URL = process.env.APP_URL ?? "http://127.0.0.1:5173";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: APP_URL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: undefined, // app + ephemeral PB are started explicitly (see above)
});
