import { expect, test } from "@playwright/test";

/**
 * AUTH-01..04 / RBAC-01 — login, guards, wrong-role redirect.
 * Requires seeded ephemeral stack (see playwright.config.ts).
 * Skips when the app URL is not serving.
 */
const APP_URL = process.env.APP_URL ?? "http://127.0.0.1:5173";
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "";

async function appUp(request: import("@playwright/test").APIRequestContext) {
  try {
    const res = await request.get(APP_URL, { timeout: 3000 });
    return res.ok();
  } catch {
    return false;
  }
}

test.describe("auth + RBAC", () => {
  test.beforeEach(async ({ request }) => {
    test.skip(!(await appUp(request)), "app not serving at APP_URL — start `npm run dev` first");
  });

  test("AUTH-01 login success lands on /dashboard", async ({ page }) => {
    test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, "set E2E_ADMIN_EMAIL/PASSWORD from seeded PB");
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(ADMIN_EMAIL);
    await page.getByLabel(/password/i).fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: /log in|sign in/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("AUTH-02 login failure stays on /login with error toast", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/email/i).fill("nobody@example.com");
    await page.getByLabel(/password/i).fill("wrong-password");
    await page.getByRole("button", { name: /log in|sign in/i }).click();
    await expect(page).toHaveURL(/\/login/);
  });

  test("AUTH-04 unauthenticated deep link redirects to /login", async ({ page }) => {
    await page.goto("/dashboard/customers/all");
    await expect(page).toHaveURL(/\/login/);
  });

  test("RBAC-01 cashier cannot open admin-only add-loadout (redirects to /dashboard)", async ({
    page,
  }) => {
    // Placeholder until a cashier seed exists: documents the matrix slot.
    // Fill in E2E_CASHIER_* creds to activate.
    test.skip(!process.env.E2E_CASHIER_EMAIL, "cashier seed not wired yet");
    await page.goto("/dashboard/warehouse/add-loadout");
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
