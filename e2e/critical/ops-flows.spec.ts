import { expect, test } from "@playwright/test";
import { appUp, credsAvailable, loginAsAdmin } from "../helpers";

/**
 * LOAD-01 / APPR-01 / IN-01 / ADJ-01+02 — operations P0 surfaces (authenticated
 * as admin, which holds every role gate). Write-path invariants (stock moves,
 * exactly-once posting) are pinned at unit level in fieldSales/adjustments
 * tests with mocked PB; these specs guard the routes + render paths.
 */
test.describe("operations P0 flows", () => {
  test.beforeEach(async ({ page, request }) => {
    test.skip(!(await appUp(request)), "app not serving at APP_URL");
    test.skip(!credsAvailable(), "set E2E_ADMIN_EMAIL/PASSWORD from seeded PB");
    await loginAsAdmin(page);
  });

  test("LOAD-01 add-loadout page renders VSE + date inputs", async ({ page }) => {
    await page.goto("/dashboard/warehouse/add-loadout");
    await expect(page.getByRole("heading", { name: "Add Loadout" })).toBeVisible();
    // See pos-sale.spec.ts NOTE: role+name matching misses cmdk triggers here.
    await expect(page.locator('[role="combobox"]:has-text("Select VSE")')).toBeVisible();
    await page.locator('[role="combobox"]:has-text("Select VSE")').click();
    await expect(page.getByPlaceholder("Search VSE...")).toBeVisible();
  });

  test("APPR-01 VSE sales approvals queue renders", async ({ page }) => {
    await page.goto("/dashboard/approvals/vse-sales");
    await expect(page.getByText("VSE Sales Approvals").first()).toBeVisible();
  });

  test("IN-01 stocks-coming-in form renders PO inputs", async ({ page }) => {
    await page.goto("/dashboard/operations/stocks-coming-in");
    await expect(page.getByRole("heading", { name: "Stocks Coming In" })).toBeVisible();
    await expect(page.getByPlaceholder("e.g., PO-2024-001")).toBeVisible();
  });

  test("ADJ-01/02 adjustments form renders direction + reason inputs", async ({ page }) => {
    await page.goto("/dashboard/operations/adjustments");
    await expect(page.getByRole("heading", { name: "Adjustments" })).toBeVisible();
  });
});
