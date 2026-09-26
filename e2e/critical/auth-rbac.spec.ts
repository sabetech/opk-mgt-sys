import { expect, test } from "@playwright/test";
import { ADMIN_EMAIL, ADMIN_PASSWORD, PB_URL, adminToken, appUp, credsAvailable } from "../helpers";

/**
 * AUTH-01..04 / RBAC-01 — login, guards, wrong-role redirect.
 * Requires seeded ephemeral stack (see playwright.config.ts + .env.e2e).
 * Skips when the app URL is not serving.
 */
test.describe("auth + RBAC", () => {
  test.beforeEach(async ({ request }) => {
    test.skip(!(await appUp(request)), "app not serving at APP_URL — start `npm run dev` first");
  });

  test("AUTH-01 login success lands on /dashboard", async ({ page }) => {
    test.skip(!credsAvailable(), "set E2E_ADMIN_EMAIL/PASSWORD from seeded PB");
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

  test("RBAC-01 cashier cannot open admin-only add-loadout", async ({ page, request }) => {
    test.skip(!credsAvailable(), "set E2E_ADMIN_EMAIL/PASSWORD from seeded PB");
    // Provision a throwaway cashier via the API (unique email per run).
    const stamp = Date.now();
    const cashierEmail = `cashier-e2e-${stamp}@example.com`;
    const cashierPassword = `Cashier#${stamp}`;
    const token = await adminToken(request);
    const created = await request.post(`${PB_URL}/api/collections/users/records`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        email: cashierEmail,
        password: cashierPassword,
        passwordConfirm: cashierPassword,
        name: "E2E Cashier",
        role: "cashier",
      },
    });
    expect(created.ok()).toBeTruthy();

    await page.goto("/login");
    await page.getByLabel(/email/i).fill(cashierEmail);
    await page.getByLabel(/password/i).fill(cashierPassword);
    await page.getByRole("button", { name: /log in|sign in/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    await page.goto("/dashboard/warehouse/add-loadout");
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("heading", { name: "Add Loadout" })).toHaveCount(0);
  });
});
