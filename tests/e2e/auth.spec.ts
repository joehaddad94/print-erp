import { expect, test } from "@playwright/test";
import { E2E_USER } from "../../playwright.config";
import { checkPage, login } from "./helpers";

test.describe("A-06/A-07 login", () => {
  test("signed-out visitors are sent to /login", async ({ page }) => {
    for (const path of ["/", "/orders", "/settings", "/more"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
    }
  });

  test("a forged session cookie is not accepted", async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: "session", value: "eyJzdWIiOjF9.forged", url: baseURL! }]);
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("wrong password shows one generic error and keeps the username", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Username").fill(E2E_USER.username);
    await page.getByLabel("Password").fill("not-the-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Wrong username or password." })).toBeVisible();
    await expect(page.getByLabel("Username")).toHaveValue(E2E_USER.username);
  });

  test("empty form shows field errors under each field", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Enter your username")).toBeVisible();
    await expect(page.getByText("Enter your password")).toBeVisible();
  });

  test("good login lands on Today; sign out clears the cookie and returns to /login", async ({ page, context }) => {
    await login(page);
    const cookie = (await context.cookies()).find((c) => c.name === "session");
    expect(cookie?.httpOnly).toBe(true);
    await page.goto("/more");
    await page.getByRole("main").getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);
    expect((await context.cookies()).find((c) => c.name === "session")).toBeUndefined();
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe("U-01/U-03/U-04 accessibility", () => {
  test("login page", async ({ page }) => {
    await page.goto("/login");
    await checkPage(page);
  });

  for (const scheme of ["light", "dark"] as const) {
    test(`signed-in pages (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await login(page);
      for (const path of ["/", "/more", "/recipes", "/settings"]) {
        await page.goto(path);
        await expect(page.locator("h1")).toBeVisible();
        await checkPage(page);
      }
    });
  }
});

test("K-S1 health check reaches the database", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
});
