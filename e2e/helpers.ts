import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const APP_URL = process.env.APP_URL ?? "http://127.0.0.1:5174";
export const PB_URL = process.env.PB_URL ?? "http://127.0.0.1:8091";
export const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "";
export const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "";

export function credsAvailable() {
  return Boolean(ADMIN_EMAIL && ADMIN_PASSWORD);
}

/** Skip-safe reachability probe for the ephemeral app. */
export async function appUp(request: APIRequestContext) {
  try {
    const res = await request.get(APP_URL, { timeout: 3000 });
    return res.ok();
  } catch {
    return false;
  }
}

/** UI login as the seeded admin; ends on /dashboard. */
export async function loginAsAdmin(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(ADMIN_EMAIL);
  await page.getByLabel(/password/i).fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /log in|sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

/** Admin auth token via PocketBase API (for test setup calls). */
export async function adminToken(request: APIRequestContext): Promise<string> {
  const res = await request.post(`${PB_URL}/api/collections/users/auth-with-password`, {
    data: { identity: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  if (!res.ok()) throw new Error(`admin API login failed: ${res.status()}`);
  const body = (await res.json()) as { token: string };
  return body.token;
}
