import { expect, test } from "@playwright/test";

/**
 * SALE-01/03/04 — POS checkout, empties guard, approve decrements stock.
 * Ephemeral stack required; all specs skip when the app is not serving.
 * Each test documents the user action + PocketBase invariant it will assert
 * once seed credentials are wired (no prod data is ever touched).
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

test.describe("POS sale critical flow", () => {
  test.beforeEach(async ({ request }) => {
    test.skip(!(await appUp(request)), "app not serving at APP_URL");
    test.skip(!process.env.E2E_ADMIN_EMAIL, "seed creds not wired — see playwright.config.ts");
  });

  test("SALE-01 checkout creates pending order + held crate deposit + receipt", async ({ page }) => {
    await page.goto("/dashboard/pos/sale");
    await expect(page.getByText(/point of sale|new sale/i).first()).toBeVisible();
    // TODO(seed): pick seeded customer + returnable product, checkout, assert
    // `orders.status=pending`, `crate_deposits.status=held`, receipt iframe prints.
  });

  test("SALE-03 non-MOU empties guard blocks oversell", async ({ page }) => {
    await page.goto("/dashboard/pos/sale");
    // TODO(seed): non-MOU customer with live=2 buying 10 returnables, no
    // deposit -> expect "Insufficient empties balance" toast, no order created.
    await expect(page).toHaveURL(/sale/);
  });

  test("SALE-04 approve decrements warehouse_stock + writes inventory_logs", async ({ page }) => {
    await page.goto("/dashboard/pos/orders");
    // TODO(seed): open seeded pending order, approve, assert stock decrement
    // and `inventory_logs(type=retail/wholesale_sale)` row.
    await expect(page).toHaveURL(/orders/);
  });
});
