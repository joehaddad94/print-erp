import { machines, products } from "@/db/schema";
import { setSetting } from "@/server/settings/service";
import { stockFor } from "@/server/assembly/service";
import { recordMovement } from "@/server/stock/ledger";
import { syntheticGcode } from "../support/synthetic-gcode";
import { withDb } from "./db";
import { checkPage, fillStart, login, newCustomerOnOrder, newStockItem, runningPrint } from "./helpers";
import { expect, test, type Page } from "./test";

/**
 * R10: the redesign end to end, one flow per milestone that the older specs don't already walk:
 * roles and one-time passwords (R1), Restore (R2), taking a reserved piece for a sooner order (R4),
 * running costs that repeat (R7) and How costs work on a real print (R9).
 */
const rows = (page: Page, text: string) => page.locator(":is(tr, li):visible").filter({ hasText: text });

async function signOut(page: Page) {
  await page.goto("/more");
  await page.getByRole("main").getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
}

test("R1 owner adds staff with a one-time password; staff picks a password and can't open owner screens", async ({
  page,
}, info) => {
  const name = `staff${info.project.name}${Date.now() % 100000}`;
  await login(page);
  await page.goto("/settings");
  await page.getByLabel("Add person: username").fill(name);
  await page.getByRole("button", { name: "Add person" }).click();
  const details = page.getByRole("status").filter({ hasText: `Sign-in details for ${name}` });
  await expect(details).toBeVisible();
  await expect(details.locator("code").nth(0)).toHaveText(name);
  const otp = (await details.locator("code").nth(1).textContent())!.trim();
  await expect(page.getByRole("button", { name: "Copy username" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy one-time password" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy sign-in details" })).toBeVisible();
  await expect(page.getByRole("list", { name: "People" })).toContainText("Hasn't chosen a password yet");
  await signOut(page);

  await page.getByLabel("Username").fill(name);
  await page.getByLabel("Password").fill(otp);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/change-password/);
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Current password").fill(otp);
  await page.getByLabel("New password", { exact: true }).fill("staff-password-123");
  await page.getByLabel("New password again").fill("staff-password-123");
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();

  await page.goto("/more");
  await expect(page.getByRole("main").getByRole("link", { name: "Settings" })).toBeVisible();
  for (const label of ["Change history", "How costs work"])
    await expect(page.getByRole("link", { name: label })).toHaveCount(0);
  for (const path of ["/history", "/costs", "/stock/adjust"]) {
    await page.goto(path);
    await expect(page.getByText("That screen is for the owner only.")).toBeVisible();
  }
  expect((await page.request.get("/api/backup")).status()).toBe(403);
  await page.goto("/settings");
  await expect(page.getByRole("list", { name: "People" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Download full backup" })).toHaveCount(0);
});

test("R2 Restore puts a customer's old name back, as a new line in Change history", async ({ page }, info) => {
  const t = `${info.project.name}${Date.now() % 100000}`;
  await login(page);
  await page.goto("/customers/new");
  await page.getByLabel("Name").fill(`Before ${t}`);
  await page.getByRole("button", { name: "Add customer" }).click();
  await expect(page.getByRole("heading", { level: 1, name: `Before ${t}` })).toBeVisible();
  await page.getByLabel("Name").fill(`After ${t}`);
  await page.getByRole("button", { name: "Save customer" }).click();
  await expect(page.getByRole("heading", { level: 1, name: `After ${t}` })).toBeVisible();

  await page.goto("/history?area=sales");
  const changes = page.locator(':is(table, ul)[aria-label="Changes"]:visible');
  await changes
    .locator(":is(tr, li)")
    .filter({ hasText: `After ${t}` })
    .first()
    .getByRole("button", { name: "Restore" })
    .click();
  await expect(changes.locator(":is(tr, li)").filter({ hasText: "Restored change" }).first()).toBeVisible();
  await page.goto("/customers");
  await expect(rows(page, `Before ${t}`)).toHaveCount(1);
  await expect(rows(page, `After ${t}`)).toHaveCount(0);
});

test("R4 a sooner order takes the reserved piece from a later one", async ({ page }, info) => {
  const t = `${info.project.name}${Date.now() % 100000}`;
  const product = `Keyring ${t}`;
  await withDb(async (db) => {
    const [p] = await db.insert(products).values({ name: product, salePriceUsd: 4 }).returning();
    const s = await stockFor(db, p!.id);
    await db.transaction((tx) => recordMovement(tx, { stockItemId: s, amount: 1, reason: "print", unitCostUsd: 0.4 }));
  });
  await login(page);
  const order = async (due?: string) => {
    await page.goto("/orders/new");
    await newCustomerOnOrder(page, `Take ${t} ${due ?? "later"}`);
    if (due) await page.getByLabel("Due").fill(due);
    await page.getByRole("button", { name: "Create order" }).click();
    await expect(page.getByRole("heading", { name: /^Order #\d+$/ })).toBeVisible();
    await page.getByLabel("Product").selectOption({ label: `${product} · $4.00` });
    await page.getByLabel("Quantity").last().fill("1");
    await page.getByRole("button", { name: "Add item" }).click();
    return Number(/#(\d+)/.exec((await page.getByRole("heading", { level: 1 }).textContent())!)![1]);
  };
  const later = await order();
  await expect(page.getByText("Reserved", { exact: true })).toBeVisible();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Beirut" });
  await order(today);
  await expect(page.getByText("Need to print 1").first()).toBeVisible();
  await checkPage(page);
  await page.getByRole("button", { name: new RegExp(`^Take 1 from #${later}`) }).click();
  await expect(page.getByText("Reserved", { exact: true })).toBeVisible();
  await page.goto(`/orders/${later}`);
  await expect(page.getByText("Need to print 1").first()).toBeVisible();
});

test("R7 a monthly running cost shows in Expenses, not in Purchases", async ({ page }, info) => {
  const what = `Fiber ${info.project.name}${Date.now() % 100000}`;
  await login(page);
  await page.goto("/expenses/new");
  await page.getByLabel("Category").selectOption("internet");
  await page.getByLabel("What").fill(what);
  await page.getByLabel("Amount").fill("35");
  await page.getByLabel("Paid to").fill("IDM");
  await page.getByLabel("Repeats every month").check();
  await page.getByRole("button", { name: "Save expense" }).click();
  await expect(page).toHaveURL(/\/expenses$/);
  await expect(page.getByText("Monthly, repeating").locator("..")).toContainText(what);
  await expect(rows(page, what)).toContainText("$35.00");
  await page.goto("/purchases");
  await expect(rows(page, what)).toHaveCount(0);
});

test("R9 How costs work walks a real print through all seven steps", async ({ page }, info) => {
  test.setTimeout(90_000);
  const t = `${info.project.name}${Date.now() % 100000}`;
  const printer = `Costs printer ${t}`;
  await withDb(async (db) => {
    await setSetting(db, "electricity_kwh_price", 0.64);
    await db
      .insert(machines)
      .values({ name: printer, type: "printer", avgPowerKw: 0.12, purchaseAmount: 300, expectedLifeHours: 3000 });
  });
  await login(page);
  await page.goto("/purchases/new");
  await newStockItem(page, "Filament");
  await page.getByLabel("Total paid").fill("18");
  await page.getByLabel("Material", { exact: true }).fill("PLA");
  await page.getByLabel("Colour", { exact: true }).fill(`Costs ${t}`);
  await page.getByLabel("Quantity").fill("1000");
  await page.getByRole("button", { name: "Save purchase" }).click();
  await expect(page).toHaveURL(/\/purchases$/);
  await page.goto("/recipes/import");
  const gcode = syntheticGcode({
    objects: [{ name: `costs-${t}.stl`, ids: ["1", "2"] }],
    totalGrams: 20,
    timeSeconds: 3600,
  });
  await page
    .getByLabel("G-code file", { exact: true })
    .setInputFiles({ name: `${t}.gcode`, mimeType: "text/x-gcode", buffer: Buffer.from(gcode) });
  await page.getByLabel("Recipe name").fill(`Costs ${t}`);
  await page.getByLabel("New product name").fill(`Costs ${t}`);
  await page.getByRole("button", { name: "Save recipe" }).click();
  await expect(page.getByRole("heading", { name: `Costs ${t} · v1` })).toBeVisible();
  await page.goto("/print");
  await fillStart(page, { recipe: `Costs ${t} · v1`, printer, filament: `PLA Costs ${t}` });
  await page.getByRole("button", { name: "Start print" }).click();
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  await runningPrint(page, printer).click();
  await page.getByRole("button", { name: "Finish print" }).click();
  await expect(page.getByRole("heading", { name: /^Print: / })).toBeVisible();

  await page.goto("/costs");
  const steps = page.getByRole("list", { name: "Steps" });
  await expect(steps.getByRole("heading", { level: 2 })).toHaveCount(7);
  await expect(steps.getByRole("heading", { name: /Cost of one print/ })).toBeVisible();
  await expect(page.getByText(/^Print cost \$\d/)).toBeVisible();
  await expect(page.getByRole("group", { name: "Printer cost per hour" }).getByRole("link").first()).toHaveAttribute(
    "href",
    /^\/machines\/\d+$/,
  );
  await checkPage(page);
});
