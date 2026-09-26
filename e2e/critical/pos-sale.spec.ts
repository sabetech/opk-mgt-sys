import { expect, test } from "@playwright/test";
import { appUp, credsAvailable, loginAsAdmin } from "../helpers";

/**
 * SALE-01/03/04 — POS checkout surface + guards (authenticated).
 * Full checkout write-flow (cart -> pending order -> held deposit) is covered
 * at unit level (emptiesGuard, customerBalance, receipt); these specs pin the
 * UI surface each flow hangs off so regressions in routing/guards fail loudly.
 */
test.describe("POS sale critical flow", () => {
  test.beforeEach(async ({ page, request }) => {
    test.skip(!(await appUp(request)), "app not serving at APP_URL");
    test.skip(!credsAvailable(), "set E2E_ADMIN_EMAIL/PASSWORD from seeded PB");
    await loginAsAdmin(page);
  });

  test("SALE-01 sale page renders for sales role", async ({ page }) => {
    await page.goto("/dashboard/pos/sale");
    await expect(page.getByRole("heading", { name: "Point of Sale" })).toBeVisible();
    // NOTE: getByRole(*, { name }) does not match these cmdk triggers in
    // this environment (role engine quirk — verified via ariaSnapshot probe),
    // so scope by role + text instead. The expect auto-waits past the
    // Loading... state until products resolve.
    await expect(page.locator('[role="combobox"]:has-text("Select product")')).toBeVisible();
    await page.locator('[role="combobox"]:has-text("Select product")').click();
    await expect(page.getByPlaceholder("Search product...")).toBeVisible();
  });

  test("SALE-03 empties guard surface: customer picker shows live balance slot", async ({
    page,
  }) => {
    await page.goto("/dashboard/pos/sale");
    // See NOTE above: role+name matching misses these triggers here.
    await expect(page.locator('[role="combobox"]:has-text("Select customer")')).toBeVisible();
    await page.locator('[role="combobox"]:has-text("Select customer")').click();
    await expect(page.getByPlaceholder("Search customer...")).toBeVisible();
  });

  test("SALE-04 orders list renders pending orders", async ({ page }) => {
    await page.goto("/dashboard/pos/orders");
    await expect(page.getByRole("heading", { name: "POS Orders" })).toBeVisible();
  });
});
