import { expect, test } from "./test";
import { ALL_ITEMS } from "@/components/shell/nav";
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
  for (const item of ALL_ITEMS) {
    await sidebar.getByRole("link", { name: item.label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${item.href === "/" ? "/$" : item.href}$`));
    await expect(page.locator("h1:visible")).toHaveCount(1);
    await expect(page.getByText("This screen couldn't load")).toHaveCount(0);
  }
  await expect(sidebar.getByRole("button", { name: "Sign out" })).toBeVisible();
});

test("browser back and forward keep working across screens", async ({ page }) => {
  await page.goto("/orders");
  await page.goto("/stock");
  await page.goBack();
  await expect(page.getByRole("heading", { level: 1, name: "Orders" })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole("heading", { level: 1, name: "Stock" })).toBeVisible();
});
