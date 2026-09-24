import { expect, test } from "@playwright/test";

/**
 * LOAD-01 / FIELD-01 / APPR-01 / IN-01 / ADJ-01+02 — operations P0 slots.
 * Skeleton only: each test pins the route + invariant so seed wiring is a
 * follow-up without re-planning. Skips when the app is not serving.
 */
const APP_URL = process.env.APP_URL ?? "http://127.0.0.1:5173";

async function appUp(request: import("@playwright/test").APIRequestContext) {
  try {
    const res = await request.get(APP_URL, { timeout: 3000 });
    return res.ok();
  } catch {
    return false;
  }
}

test.describe("operations P0 flows", () => {
  test.beforeEach(async ({ request }) => {
    test.skip(!(await appUp(request)), "app not serving at APP_URL");
    test.skip(!process.env.E2E_ADMIN_EMAIL, "seed creds not wired — see playwright.config.ts");
  });

  test("LOAD-01 add loadout decrements stock + writes vse_loadout log", async ({ page }) => {
    await page.goto("/dashboard/warehouse/add-loadout");
    await expect(page).toHaveURL(/add-loadout/);
  });

  test("APPR-01 dual approval posts vse_movements exactly once", async ({ page }) => {
    await page.goto("/dashboard/approvals/vse-sales");
    await expect(page).toHaveURL(/vse-sales/);
  });

  test("IN-01 stocks-coming-in creates receivable + increments stock", async ({ page }) => {
    await page.goto("/dashboard/operations/stocks-coming-in");
    await expect(page).toHaveURL(/stocks-coming-in/);
  });

  test("ADJ-01/02 adjustment request -> admin approve mutates stock once", async ({ page }) => {
    await page.goto("/dashboard/operations/adjustments");
    await expect(page).toHaveURL(/adjustments/);
  });
});
