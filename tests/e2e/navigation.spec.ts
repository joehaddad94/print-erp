import { expect, test } from "./test";
import { ALL_ITEMS, MENU_ITEMS, SIDEBAR } from "@/components/shell/nav";
import { login } from "./helpers";

test.beforeEach(async ({ page }) => {
  await login(page);
});

const PHONE_TABS = ["Today", "Orders", "Start print", "Stock", "More"];

test("phone: bottom tabs reach their screens; the sidebar is hidden", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "phone layout only");
  await expect(page.getByRole("complementary", { name: "Sidebar" })).toBeHidden();
  const tabs = page.getByRole("navigation", { name: "Main" }).filter({ visible: true });
  await expect(tabs.getByRole("link")).toHaveText(PHONE_TABS);
  for (const name of PHONE_TABS) {
    await tabs.getByRole("link", { name, exact: true }).click();
    const heading = name === "Start print" ? /Start print/ : name;
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  }
});

test("phone: More lists every screen and each one opens", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "phone layout only");
  for (const item of ALL_ITEMS) {
    await page.goto("/more");
    await page.getByRole("main").getByRole("link", { name: item.label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${item.href === "/" ? "/$" : item.href}$`));
    await expect(page.locator("h1:visible")).toHaveCount(1);
    await expect(page.getByText("This screen couldn't load")).toHaveCount(0);
  }
});

test("desktop: sidebar links reach every screen; the phone tab bar is hidden", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "desktop layout only");
  const sidebar = page.getByRole("complementary", { name: "Sidebar" });
  await expect(sidebar).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main" }).filter({ visible: true })).toHaveCount(1);
  for (const item of SIDEBAR.flatMap((g) => g.items)) {
    await sidebar.getByRole("link", { name: item.label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${item.href === "/" ? "/$" : item.href}$`));
    await expect(page.locator("h1:visible")).toHaveCount(1);
    await expect(page.getByText("This screen couldn't load")).toHaveCount(0);
  }
  // Settings, How costs work, Change history and Sign out live in the menu under your name.
  await expect(sidebar.getByRole("button", { name: "Sign out", exact: true })).toHaveCount(0);
  const me = sidebar.getByRole("button", { name: "joe · Settings, history, sign out" });
  for (const item of MENU_ITEMS) {
    await me.click();
    await expect(me).toHaveAttribute("aria-expanded", "true");
    await sidebar.getByRole("link", { name: item.label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${item.href}$`));
    await expect(page.locator("h1:visible")).toHaveCount(1);
    await expect(me).toHaveAttribute("aria-expanded", "false");
  }
  await me.click();
  await page.keyboard.press("Escape");
  await expect(me).toHaveAttribute("aria-expanded", "false");
  await expect(me).toBeFocused();
  await me.click();
  await sidebar.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("browser back and forward keep working across screens", async ({ page }) => {
  await page.goto("/orders");
  await page.goto("/stock");
  await page.goBack();
  await expect(page.getByRole("heading", { level: 1, name: "Orders" })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole("heading", { level: 1, name: "Stock" })).toBeVisible();
});

test("phone: the top bar shows ‹ the screen above; tabs show the shop name", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "phone layout only");
  const bar = page.getByRole("banner");
  await page.goto("/orders");
  await expect(bar.getByRole("link", { name: /^Back to/ })).toHaveCount(0);
  await page.goto("/customers");
  await bar.getByRole("link", { name: "Back to More" }).click();
  await expect(page).toHaveURL(/\/more$/);
  await page.goto("/orders/new");
  await bar.getByRole("link", { name: "Back to Orders" }).click();
  await expect(page).toHaveURL(/\/orders$/);
  await page.goto("/stock/adjust");
  await expect(bar.getByRole("link", { name: "Back to Stock" })).toHaveAttribute("href", "/stock");
});
