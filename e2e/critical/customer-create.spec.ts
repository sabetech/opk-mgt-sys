import { expect, test } from "@playwright/test";
import { appUp, credsAvailable, loginAsAdmin } from "../helpers";

/**
 * CUST-01 — real write flow: create a Retailer customer through the UI and
 * assert it lands in the customer list. Uses a timestamped name so reruns
 * never collide with prior rows.
 */
test.describe("customer create", () => {
  test.beforeEach(async ({ page, request }) => {
    test.skip(!(await appUp(request)), "app not serving at APP_URL");
    test.skip(!credsAvailable(), "set E2E_ADMIN_EMAIL/PASSWORD from seeded PB");
    await loginAsAdmin(page);
  });

  test("creates a retailer and lists it", async ({ page }) => {
    const name = `E2E Retail ${Date.now()}`;
    await page.goto("/dashboard/customers/add");
    await expect(page.getByRole("heading", { name: "Add Customer" })).toBeVisible();

    await page.getByLabel("Customer Name").fill(name);
    await page.getByLabel("Phone Number").fill("0540000000");
    await page.getByRole("combobox").click();
    await page.getByRole("option", { name: "Retailer", exact: true }).click();
    await page.getByRole("button", { name: "Save Customer" }).click();

    await expect(page).toHaveURL(/\/dashboard\/customers\/all/);
    await expect(page.getByText(name).first()).toBeVisible();
  });

  test("validates missing name before touching the API", async ({ page }) => {
    await page.goto("/dashboard/customers/add");
    await page.getByRole("button", { name: "Save Customer" }).click();
    // Stays on the form; toast surfaces the error (no navigation away).
    await expect(page).toHaveURL(/\/dashboard\/customers\/add/);
  });
});
