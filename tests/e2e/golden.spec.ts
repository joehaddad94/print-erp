import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { FIXTURES, haveFixtures } from "../support/fixtures";
import { syntheticGcode } from "../support/synthetic-gcode";
import { checkPage, fillStart, login, pickSupplier, runningPrint } from "./helpers";
import { expect, test, type Page } from "./test";

/**
 * The whole business through the UI only (no database shortcuts), on both viewports:
 * settings → buy a printer, filament and boxes from a supplier → import Joe's real padel G-code →
 * price + packaging → two good prints and one failed → customer → order → reserve → deliver → paid →
 * stock, customer balance, history, Today and the backup all agree.
 */
const money = (s: string | null) => Number((s ?? "").replace(/[^0-9.-]/g, ""));

async function startAndFinish(page: Page, t: { recipe: string; printer: string; filament: RegExp }, fail = false) {
  await page.goto("/print");
  await fillStart(page, { recipe: t.recipe, printer: t.printer, filament: t.filament });
  await expect(page.getByText(/^Estimated cost \$/)).toBeVisible();
  await page.getByRole("button", { name: "Start print" }).click();
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  await runningPrint(page, t.printer).click();
  await expect(page.getByRole("heading", { name: /^Finish print: / })).toBeVisible();
  if (fail) {
    await page.getByLabel("Stopped early").check();
    await page.getByLabel("How far it got (%)").fill("25");
    await page.getByLabel(/\(of 1\)$/).fill("0");
    await page.getByLabel("What went wrong").fill("warped corner");
  } else {
    await page.getByRole("button", { name: "Same as G-code" }).click();
  }
  await page.getByRole("button", { name: "Finish print" }).click();
  await expect(page.getByRole("heading", { name: /^Print: / })).toBeVisible();
}

test("G-02 full business day through the UI, real G-code", async ({ page }, info) => {
  test.setTimeout(180_000);
  const t = `${info.project.name}${Date.now() % 100000}`;
  const printer = `Ender golden ${t}`;
  const supplier = `Golden supplier ${t}`;
  const colour = `Gold ${t}`;
  const box = `Box ${t}`;
  const product = `Padel holder ${t}`;
  const customer = `Golden customer ${t}`;
  await login(page);

  // 1. Settings.
  await page.goto("/settings");
  await page.getByLabel("Electricity price per kWh (USD)").fill("0.64");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText(/^Saved\.|Nothing changed\./)).toBeVisible();

  // 2. Supplier.
  await page.goto("/suppliers");
  await page.getByLabel("Name").fill(supplier);
  await page.getByRole("button", { name: "Add supplier" }).click();
  await expect(page.getByText(`Added ${supplier}.`)).toBeVisible();

  // 3. Buy a printer, then fill in its power and life.
  await page.goto("/expenses/new");
  await page.getByLabel("Category").selectOption("machine");
  await page.getByLabel("Amount").fill("200");
  await page.getByLabel("Name").fill(printer);
  await page.getByLabel("Type").selectOption("printer");
  await page.getByLabel("Model").fill("Creality Ender-3 V3 SE");
  await pickSupplier(page, supplier);
  await page.getByRole("button", { name: "Save expense" }).click();
  await expect(page).toHaveURL(/\/expenses$/);
  await page.goto("/machines");
  await page.getByRole("link").filter({ hasText: printer }).click();
  await page.getByLabel("Average power").fill("0.12");
  await page.getByLabel("Expected life").fill("3000");
  await page.getByLabel("Nozzle (mm)").fill("0.4");
  await page.getByRole("button", { name: "Save machine" }).click();
  await expect(page.getByRole("link").filter({ hasText: printer })).toContainText("$0.067/h");

  // 4. Filament (1 kg, $17.50) and 10 boxes ($5) from the supplier.
  await page.goto("/expenses/new");
  await page.getByLabel("Category").selectOption("filament");
  await page.getByLabel("Amount").fill("17.50");
  await page.getByLabel("Material", { exact: true }).fill("PLA");
  await page.getByLabel("Colour", { exact: true }).fill(colour);
  await page.getByLabel("Grams bought").fill("1000");
  await pickSupplier(page, supplier);
  await page.getByRole("button", { name: "Save expense" }).click();
  await expect(page).toHaveURL(/\/expenses$/);
  await page.goto("/expenses/new");
  await page.getByLabel("Category").selectOption("packaging");
  await page.getByLabel("Amount").fill("5");
  await page.getByLabel("New item name").fill(box);
  await page.getByLabel("Pieces").fill("10");
  await page.getByRole("button", { name: "Save expense" }).click();
  await expect(page).toHaveURL(/\/expenses$/);
  await page.goto("/suppliers");
  await page.getByRole("link").filter({ hasText: supplier }).click();
  await expect(page.getByRole("heading", { name: /Bought:/ })).toContainText("$217.50");

  // 5. Import the real padel file (synthetic stand-in when the private fixtures are absent).
  const bytes = haveFixtures
    ? gunzipSync(readFileSync(FIXTURES.padel))
    : Buffer.from(
        syntheticGcode({ objects: [{ name: `padel-${t}.stl`, ids: ["1"] }], totalGrams: 29.22, timeSeconds: 6450 }),
      );
  // A unique trailing comment keeps the file hash unique per run (same file is refused, R-06).
  const unique = Buffer.concat([bytes, Buffer.from(`\n; golden ${t}\n`)]);
  await page.goto("/recipes/import");
  await page.getByLabel("G-code file").setInputFiles({ name: `${t}.gcode`, mimeType: "text/x-gcode", buffer: unique });
  await page.getByLabel("Recipe name").fill(product);
  await page.getByLabel("New product name").fill(product);
  await page.getByRole("button", { name: "Save recipe" }).click();
  await expect(page.getByRole("heading", { name: `${product} · v1` })).toBeVisible();
  await page.getByLabel("Hands-on minutes per plate").fill("10");
  await page.getByRole("button", { name: "Save adjustments" }).click();
  await expect(page.getByText("labour minutes: — → 10")).toBeVisible();

  // 6. Price and packaging on the product.
  await page.getByRole("list", { name: "Items on the plate" }).getByRole("link").click();
  await page.getByLabel("Sale price").fill("6");
  await page.getByLabel("Packaging").selectOption({ label: box });
  await page.getByRole("button", { name: "Save product" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: product })).toContainText("$6.00");

  // 7. Two good prints and one failed.
  const job = { recipe: `${product} · v1`, printer, filament: new RegExp(`^PLA ${colour}`) };
  await startAndFinish(page, job);
  await startAndFinish(page, job, true);
  await startAndFinish(page, job);
  await page.goto("/stock");
  await expect(page.getByRole("listitem").filter({ hasText: product })).toContainText("2 pcs");
  await expect(page.getByRole("listitem").filter({ hasText: box })).toContainText("10 pcs");

  // 8. Customer, order of 2, reserve, deliver with a driver, pay in two parts.
  await page.goto("/customers");
  await page.getByLabel("Name").fill(customer);
  await page.getByLabel("Phone").fill("+961 76 000 000");
  await page.getByRole("button", { name: "Add customer" }).click();
  await expect(page.getByText(`Added ${customer}.`)).toBeVisible();
  await page.goto("/orders/new");
  await page.getByLabel("Customer", { exact: true }).selectOption({ label: customer });
  await page.getByLabel("Channel").selectOption("instagram");
  await page.getByRole("button", { name: "Create order" }).click();
  await expect(page.getByRole("heading", { name: /^Order #\d+$/ })).toBeVisible();
  await page.getByLabel("Product").selectOption({ label: `${product} · $6.00` });
  await page.getByLabel("Quantity").last().fill("2");
  await page.getByRole("button", { name: "Add item" }).click();
  await expect(page.getByText(`2 × ${product}`)).toBeVisible();
  await page.getByRole("button", { name: "Reserve from stock" }).click();
  await expect(page.getByText("Reserved", { exact: true })).toBeVisible();
  await checkPage(page);
  await page.getByLabel("Driver").first().fill("Toufic");
  await page.getByLabel("Delivery charge").first().fill("3");
  await page.getByRole("button", { name: "Deliver whole order" }).click();
  await expect(page.getByText(/^Delivered .*Stock and packaging were taken out\.$/)).toBeVisible();
  await expect(page.getByText("Delivery charge, for the driver (Toufic)").locator("..")).toContainText("$3.00");
  await expect(page.getByText("Total (items only)").locator("..")).toContainText("$12.00");
  for (const amount of ["5", "7"]) {
    await page.getByLabel("Amount").fill(amount);
    await page.getByRole("button", { name: "Record payment" }).click();
    await expect(page.getByText("Payment recorded.")).toBeVisible();
  }
  await expect(page.getByText("Paid", { exact: true })).toBeVisible();
  const profit = money(await page.getByText("Profit", { exact: true }).locator("..").locator("dd").textContent());
  // Items only (D37): $12 minus two pieces' cost (incl. a share of the failed print) and two $0.50 boxes.
  expect(profit).toBeGreaterThan(8);
  expect(profit).toBeLessThan(11);
  await expect(page.getByText("Profit per hour of your time").locator("..")).toContainText("/h");
  await checkPage(page);

  // 9. Everything else agrees.
  await page.goto("/stock");
  await expect(page.getByRole("listitem").filter({ hasText: product })).toContainText("0 pcs");
  await expect(page.getByRole("listitem").filter({ hasText: box })).toContainText("8 pcs");
  await page.goto("/customers");
  const row = page.getByRole("link").filter({ hasText: customer });
  await expect(row).toContainText("1 order");
  await row.click();
  await expect(page.getByText("Balance owed").locator("..")).toContainText("$0.00");
  await page.goto("/history?area=printing");
  const changes = page.locator(':is(table, ul)[aria-label="Changes"]:visible');
  await expect(changes).toContainText("Hands-on minutes");
  await expect(changes).toContainText("10");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.goto("/settings").then(() => page.getByRole("link", { name: "Download backup" }).click()),
  ]);
  const dump = JSON.parse(await readFile((await download.path())!, "utf8")) as {
    tables: Record<string, { count: number; rows?: unknown[] }>;
  };
  expect(dump.tables.orders!.count).toBeGreaterThan(0);
  expect(dump.tables.payments!.count).toBeGreaterThan(1);
  expect(JSON.stringify(dump.tables.customers)).toContain(customer);
});
