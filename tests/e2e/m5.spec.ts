import { expect, test, type Page } from "@playwright/test";
import { machines, products } from "@/db/schema";
import { setSetting } from "@/server/settings/service";
import { syntheticGcode } from "../support/synthetic-gcode";
import { withDb } from "./db";
import { checkPage, login } from "./helpers";

test.beforeEach(async ({ page }) => {
  await login(page);
});

async function newOrder(page: Page, customer: string) {
  await page.goto("/orders/new");
  await page.getByLabel("New customer name").fill(customer);
  await page.getByRole("button", { name: "Create order" }).click();
  await expect(page.getByRole("heading", { name: /^Order #\d+$/ })).toBeVisible();
}

async function addItem(page: Page, product: string, qty: string) {
  await page.getByLabel("Product").selectOption({ label: product });
  await page.getByLabel("Quantity").last().fill(qty);
  await page.getByRole("button", { name: "Add item" }).click();
}

test("O-01 a product without a price can't be added, with a link to fix it", async ({ page }, info) => {
  const name = `Unpriced ${info.project.name}`;
  const [p] = await withDb((db) => db.insert(products).values({ name }).returning());
  await newOrder(page, `O-01 ${info.project.name}`);
  await addItem(page, `${name} (no price)`, "1");
  await expect(page.getByText("Set a sale price for this product first")).toBeVisible();
  await expect(page.getByRole("link", { name: "Fix it" })).toHaveAttribute("href", `/products/${p!.id}`);
});

test("O-04/Y-02 deliver is disabled until reserved; courier cash shows until Mark received", async ({ page }, info) => {
  const name = `Priced ${info.project.name}`;
  await withDb((db) => db.insert(products).values({ name, salePriceUsd: 5 }));
  await newOrder(page, `O-04 ${info.project.name}`);
  await addItem(page, `${name} · $5.00`, "2");
  await expect(page.getByText("Need to print 2").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Deliver whole order" })).toBeDisabled();
  await checkPage(page);

  await page.getByLabel("Amount").fill("10");
  await page.getByLabel("Method").selectOption("courier_cod");
  await page.getByLabel("Collected by").fill("Toufic");
  await page.getByRole("button", { name: "Record payment" }).click();
  await expect(page.getByText("Courier has cash").first()).toBeVisible();
  await page.getByRole("button", { name: "Mark received" }).click();
  await expect(page.getByRole("button", { name: "Mark received" })).toHaveCount(0);
  await expect(page.getByText("Paid", { exact: true })).toBeVisible();
});

test("G-01 golden scenario on the phone: buy → import → print 2 → order → deliver → paid, profit shown", async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  const tag = `g01-${info.project.name}`;
  await withDb(async (db) => {
    await setSetting(db, "electricity_kwh_price", 0.64);
    await db.insert(machines).values({
      name: `Printer ${tag}`,
      type: "printer",
      model: "Ender-3 V3 SE",
      nozzleMm: 0.4,
      avgPowerKw: 0.12,
      purchaseAmount: 200,
      expectedLifeHours: 3000,
    });
  });

  // Buy filament.
  await page.goto("/expenses/new");
  await page.getByLabel("Category").selectOption("filament");
  await page.getByLabel("Amount").fill("17.50");
  await page.getByLabel("Material", { exact: true }).fill("PLA");
  await page.getByLabel("Colour", { exact: true }).fill(tag);
  await page.getByLabel("Grams bought").fill("1000");
  await page.getByRole("button", { name: "Save expense" }).click();
  await expect(page).toHaveURL(/\/expenses$/);

  // Import a padel-shaped file (29.22 g, 1 piece, 6,450 s), add hands-on minutes and a price.
  const product = `Padel ${tag}`;
  await page.goto("/recipes/import");
  const gcode = syntheticGcode({
    objects: [{ name: `padel-${tag}.stl`, ids: ["1"] }],
    totalGrams: 29.22,
    timeSeconds: 6450,
  });
  await page
    .getByLabel("G-code file")
    .setInputFiles({ name: `${tag}.gcode`, mimeType: "text/x-gcode", buffer: Buffer.from(gcode) });
  await page.getByLabel("Recipe name").fill(product);
  await page.getByLabel("New product name").fill(product);
  await page.getByRole("button", { name: "Save recipe" }).click();
  await expect(page.getByRole("heading", { name: `${product} · v1` })).toBeVisible();
  await page.getByLabel("Hands-on minutes per plate").fill("15");
  await page.getByRole("button", { name: "Save adjustments" }).click();
  await expect(page.getByText("labour minutes: — → 15")).toBeVisible();
  await page.getByRole("link", { name: new RegExp(`^${product}`) }).click();
  await page.getByLabel("Sale price").fill("5");
  await page.getByRole("button", { name: "Save product" }).click();
  await expect(page).toHaveURL(/\/products$/);

  // Print it twice.
  for (let k = 0; k < 2; k++) {
    await page.goto("/print");
    await page.getByLabel("Recipe").selectOption({ label: `${product} · v1` });
    await page.getByLabel("Printer", { exact: true }).selectOption({ label: `Printer ${tag}` });
    await page
      .getByLabel("Filament", { exact: true })
      .selectOption({ label: `PLA ${tag} (${1000 - Math.round(k * 29.22)} g left)` });
    await page.getByRole("button", { name: "Start print" }).click();
    await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
    await page
      .getByRole("list", { name: "Printing now" })
      .getByRole("link")
      .filter({ hasText: `Printer ${tag}` })
      .click();
    await page.getByRole("button", { name: "Save and add to stock" }).click();
    await expect(page.getByRole("heading", { name: /^Print: / })).toBeVisible();
  }

  // Order 2 at $5, reserve, deliver, pay $4 then $6.
  await newOrder(page, `Customer ${tag}`);
  await checkPage(page);
  await addItem(page, `${product} · $5.00`, "2");
  await page.getByRole("button", { name: "Reserve from stock" }).click();
  await expect(page.getByText("Reserved", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Deliver whole order" }).click();
  await expect(page.getByText(/^Delivered .*Stock and packaging were taken out\.$/)).toBeVisible();
  for (const amount of ["4", "6"]) {
    await page.getByLabel("Amount").fill(amount);
    await page.getByRole("button", { name: "Record payment" }).click();
    await expect(page.getByText("Payment recorded.")).toBeVisible();
  }
  await expect(page.getByText("Paid", { exact: true })).toBeVisible();
  const profit = page.getByRole("definition").filter({ hasText: "$8.25" });
  await expect(profit).toBeVisible();
  await expect(page.getByText("$16.51/h")).toBeVisible();
  await checkPage(page);
});
