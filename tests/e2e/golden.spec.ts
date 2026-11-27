import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { FIXTURES, haveFixtures } from "../support/fixtures";
import { syntheticGcode } from "../support/synthetic-gcode";
import {
  addOrderItem,
  checkPage,
  costPanel,
  deliverOrder,
  editInline,
  fillStart,
  login,
  newStockItem,
  pickIn,
  pickSupplier,
  recordOrderPayment,
  runningPrint,
} from "./helpers";
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
  await expect(costPanel(page)).toContainText(/Job cost\s*\$\d/);
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
  await editInline(page, "Electricity per kWh", "0.64");
  await expect(page.getByRole("button", { name: "electricity per kwh: $0.64. Change" })).toBeVisible();

  // 2. Supplier.
  await page.goto("/suppliers/new");
  await page.getByLabel("Name").fill(supplier);
  await page.getByRole("button", { name: "Add supplier" }).click();
  await expect(page.getByRole("heading", { level: 1, name: supplier })).toBeVisible();

  // 3. Buy a printer, then fill in its power and life.
  await page.goto("/machines/new");
  await page.getByLabel("Purchase cost").fill("200");
  await page.getByLabel("Name", { exact: true }).fill(printer);
  await page.getByRole("radio", { name: "Printer" }).check();
  await page.getByLabel("Model").fill("Creality Ender-3 V3 SE");
  await pickSupplier(page, supplier);
  await page.getByRole("button", { name: "Save machine" }).click();
  await expect(page).toHaveURL(/\/machines$/);
  await page.goto("/machines");
  await page.locator(":is(tr, li):visible").filter({ hasText: printer }).getByRole("link").first().click();
  await page.getByLabel("Average power").fill("0.12");
  await page.getByLabel("Expected life").fill("3000");
  await page.getByLabel("Nozzle", { exact: true }).fill("0.4");
  await page.getByRole("button", { name: "Save machine" }).click();
  await expect(page.locator(":is(tr, li):visible").filter({ hasText: printer })).toContainText("$0.067");

  // 4. Filament (1 kg, $17.50) and 10 boxes ($5) from the supplier.
  await page.goto("/purchases/new");
  await newStockItem(page, "Filament");
  await page.getByLabel("Total paid").fill("17.50");
  await page.getByLabel("Material", { exact: true }).fill("PLA");
  await page.getByLabel("Colour", { exact: true }).fill(colour);
  await page.getByLabel("Quantity").fill("1000");
  await pickSupplier(page, supplier);
  await page.getByRole("button", { name: "Save purchase" }).click();
  await expect(page).toHaveURL(/\/purchases$/);
  await page.goto("/purchases/new");
  await newStockItem(page, "Packaging");
  await page.getByLabel("Total paid").fill("5");
  await page.getByLabel("New item name").fill(box);
  await page.getByLabel("Quantity").fill("10");
  await page.getByRole("button", { name: "Save purchase" }).click();
  await expect(page).toHaveURL(/\/purchases$/);
  await page.goto("/suppliers");
  await page.locator(":is(tr, li):visible").filter({ hasText: supplier }).getByRole("link").first().click();
  await expect(page.getByText("Spent in total").locator("..")).toContainText("$217.50");

  // 5. Import the real padel file (synthetic stand-in when the private fixtures are absent).
  const bytes = haveFixtures
    ? gunzipSync(readFileSync(FIXTURES.padel))
    : Buffer.from(
        syntheticGcode({ objects: [{ name: `padel-${t}.stl`, ids: ["1"] }], totalGrams: 29.22, timeSeconds: 6450 }),
      );
  // A unique trailing comment keeps the file hash unique per run (same file is refused, R-06).
  const unique = Buffer.concat([bytes, Buffer.from(`\n; golden ${t}\n`)]);
  await page.goto("/recipes/import");
  await page
    .getByLabel("G-code file", { exact: true })
    .setInputFiles({ name: `${t}.gcode`, mimeType: "text/x-gcode", buffer: unique });
  await page.getByLabel("Recipe name").fill(product);
  await page.getByLabel("New product name").fill(product);
  await page.getByRole("button", { name: "Save recipe" }).click();
  await expect(page.getByRole("heading", { name: `${product} · v1` })).toBeVisible();
  await page.getByLabel("Hands-on minutes per plate").fill("10");
  await page.getByRole("button", { name: "Save adjustments" }).click();
  await expect(page.getByText("labour minutes: — → 10")).toBeVisible();

  // 6. Price and packaging on the product.
  await page.getByRole("list", { name: "Items on the plate" }).getByRole("link").click();
  await editInline(page, "Sale price", "6");
  await expect(page.getByRole("button", { name: /^sale price: \$6\.00/ })).toBeVisible();
  await editInline(page, "Packaging", box, { select: true });
  await expect(page.getByRole("button", { name: new RegExp(`^packaging: ${box}`) })).toBeVisible();
  await page.goto("/products");
  await expect(page.locator(":is(tr, li):visible").filter({ hasText: product })).toContainText("$6.00");

  // 7. Two good prints and one failed.
  const job = { recipe: `${product} · v1`, printer, filament: new RegExp(`^PLA ${colour}`) };
  await startAndFinish(page, job);
  await startAndFinish(page, job, true);
  await startAndFinish(page, job);
  await page.goto("/stock");
  await expect(page.locator(":is(tr, li):visible").filter({ hasText: product })).toContainText("2 pcs");
  await expect(page.locator(":is(tr, li):visible").filter({ hasText: box })).toContainText("10 pcs");

  // 8. Customer, order of 2, reserve, deliver with a driver, pay in two parts.
  await page.goto("/customers/new");
  await page.getByLabel("Name").fill(customer);
  await page.getByLabel("Phone").fill("76 000 000");
  await page.getByRole("button", { name: "Add customer" }).click();
  await expect(page.getByRole("heading", { level: 1, name: customer })).toBeVisible();
  await expect(page.getByText("+961 76 000 000 · customer since")).toBeVisible();
  await page.goto("/orders/new");
  await pickIn(page, "Customer", customer);
  await page.getByRole("radio", { name: "Instagram" }).check();
  await page.getByRole("button", { name: "Create order" }).click();
  await expect(page.getByRole("heading", { name: /^Order #\d+$/ })).toBeVisible();
  await addOrderItem(page, `${product} · $6.00`, "2");
  await expect(page.getByRole("button", { name: "quantity: 2 ×. Change" })).toBeVisible();
  await expect(page.getByText("Reserved", { exact: true })).toBeVisible();
  await checkPage(page);
  await editInline(page, "Driver", "Toufic");
  await expect(page.getByRole("button", { name: "driver: Toufic. Change" })).toBeVisible();
  await editInline(page, "Delivery charge", "3");
  await expect(page.getByRole("button", { name: "delivery charge: $3. Change" })).toBeVisible();
  await deliverOrder(page);
  await expect(page.getByText(/^Delivered .* by Toufic\./)).toBeVisible();
  await expect(page.getByText("Total (items only)").locator("..")).toContainText("$12.00");
  for (const amount of ["5", "7"]) await recordOrderPayment(page, amount);
  await expect(page.getByText("Paid", { exact: true })).toBeVisible();
  const profit = money(await page.getByText("Profit", { exact: true }).locator("..").locator("dd").textContent());
  // Items only (D37): $12 minus two pieces' cost (incl. a share of the failed print) and two $0.50 boxes.
  expect(profit).toBeGreaterThan(8);
  expect(profit).toBeLessThan(11);
  await expect(page.getByText("Per hour of your time").locator("..")).toContainText("$");
  await checkPage(page);

  // 9. Everything else agrees.
  await page.goto("/stock");
  await expect(page.locator(":is(tr, li):visible").filter({ hasText: product })).toContainText("0 pcs");
  await expect(page.locator(":is(tr, li):visible").filter({ hasText: box })).toContainText("8 pcs");
  await page.goto("/customers");
  await page.locator(":is(tr, li):visible").filter({ hasText: customer }).getByRole("link").first().click();
  await expect(page.getByText("Delivered", { exact: true }).first().locator("..")).toContainText("1 order");
  await expect(page.getByText("Owes you", { exact: true }).locator("..")).toContainText("$0.00");
  await page.goto("/history?area=printing");
  const changes = page.locator(':is(table, ul)[aria-label="Changes"]:visible');
  await expect(changes).toContainText("Hands-on minutes");
  await expect(changes).toContainText("10");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.goto("/settings").then(() => page.getByRole("link", { name: "Data only (.json)" }).click()),
  ]);
  const dump = JSON.parse(await readFile((await download.path())!, "utf8")) as {
    tables: Record<string, { count: number; rows?: unknown[] }>;
  };
  expect(dump.tables.orders!.count).toBeGreaterThan(0);
  expect(dump.tables.payments!.count).toBeGreaterThan(1);
  expect(JSON.stringify(dump.tables.customers)).toContain(customer);
});
