import { ALL_ITEMS } from "@/components/shell/nav";
import { E2E_USER } from "../../playwright.config";
import { PAGE_BUDGET_MS, openScreen, watchErrors } from "./helpers";
import { expect, test } from "./test";

/**
 * @smoke: READ-ONLY. Safe against the live app (BASE_URL=… pnpm test:e2e:live).
 * It signs in (which only stamps last-login time), opens every screen, and signs out.
 * It never submits a business form, never tries a wrong password (that would throttle the real login).
 */
test.describe("@smoke", () => {
  test("health check answers quickly and says the database is reachable", async ({ request }) => {
    const t = Date.now();
    const res = await request.get("/api/health", { timeout: PAGE_BUDGET_MS * 2 });
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(Date.now() - t).toBeLessThan(PAGE_BUDGET_MS * 2);
  });

  test("login page renders and signed-out visitors are sent to it", async ({ page }) => {
    await page.goto("/orders");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  test("sign in, open every screen inside the time budget, sign out", async ({ page }) => {
    test.setTimeout(30_000 + ALL_ITEMS.length * PAGE_BUDGET_MS * 2);
    const errors = watchErrors(page);
    await page.goto("/login");
    await page.getByLabel("Username").fill(E2E_USER.username);
    await page.getByLabel("Password").fill(E2E_USER.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("heading", { name: "Today" })).toBeVisible({ timeout: PAGE_BUDGET_MS * 2 });
    const timings: string[] = [];
    for (const path of [...ALL_ITEMS.map((i) => i.href), "/more", "/orders/new", "/expenses/new", "/products/new"]) {
      timings.push(`${path} ${await openScreen(page, path, PAGE_BUDGET_MS * 2)} ms`);
    }
    console.log(timings.join("\n"));
    expect(errors).toEqual([]);
    await page.goto("/more");
    await page.getByRole("main").getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);
  });
});
