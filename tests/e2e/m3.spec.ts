import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { expect, test, type Page } from "./test";
import { sql } from "drizzle-orm";
import { machines, recipes, settings } from "@/db/schema";
import { expenseSchema } from "@/server/expenses/schema";
import { createExpense } from "@/server/expenses/service";
import { setSetting } from "@/server/settings/service";
import { FIXTURES, haveFixtures } from "../support/fixtures";
import { syntheticGcode, syntheticMovesOnly } from "../support/synthetic-gcode";
import { rowCounts, uploadedFileCount, withDb } from "./db";
import { checkPage, login } from "./helpers";

test.beforeEach(async ({ page }) => {
  await login(page);
});

const fixtureBuffer = (name: keyof typeof FIXTURES) => gunzipSync(readFileSync(FIXTURES[name]));
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

/** Recipes from earlier tests or the other viewport are set aside so each import starts clean. */
async function clearRecipes() {
  await withDb((db) =>
    db
      .update(recipes)
      .set({ deletedAt: new Date() })
      .where(sql`${recipes.deletedAt} is null`),
  );
}

async function chooseFile(page: Page, name: string, buffer: Buffer) {
  await page.getByLabel("G-code file").setInputFiles({ name, mimeType: "text/x-gcode", buffer });
}

const twoObjects = (tag: string) =>
  Buffer.from(
    syntheticGcode({
      objects: [
        { name: `hook-${tag}.stl`, ids: ["1"] },
        { name: `base-${tag}.stl`, ids: ["2"] },
      ],
      totalGrams: 10,
    }),
  );

test("K-03 without an electricity price the calculator says what's missing and links to Settings", async ({ page }) => {
  await withDb((db) => db.insert(settings).values({ key: "electricity_kwh_price", value: sql`'null'::jsonb` }));
  await page.goto("/calculator");
  await chooseFile(page, "clip.gcode", twoObjects("k03"));
  await expect(page.getByText("Cost incomplete")).toBeVisible();
  await expect(page.getByRole("link", { name: "Set electricity price" })).toHaveAttribute("href", "/settings");
  await checkPage(page);
});

test("K-01/K-02 padel file: job $0.77, per piece $0.87, and nothing is saved or uploaded", async ({ page }) => {
  test.skip(!haveFixtures, "Joe's G-code fixtures are not in this checkout");
  await withDb(async (db) => {
    await setSetting(db, "electricity_kwh_price", 0.64);
    const [printer] = (await db.execute(sql`select 1 from machines where name = 'K01 printer'`)) as unknown[];
    if (!printer)
      await db.insert(machines).values({
        name: "K01 printer",
        type: "printer",
        avgPowerKw: 0.12,
        purchaseAmount: 200,
        expectedLifeHours: 3000,
      });
    const [has] = (await db.execute(sql`select 1 from stock_items where name = 'PLA K01'`)) as unknown[];
    if (!has)
      await createExpense(
        db,
        expenseSchema.parse({
          spentOn: "2026-11-25",
          category: "filament",
          amount: "17.50",
          currency: "USD",
          newMaterial: "PLA",
          newColor: "K01",
          grams: "1000",
        }),
      );
  });
  await page.goto("/calculator");
  const before = await rowCounts();
  const filesBefore = uploadedFileCount();
  await chooseFile(page, "adidas padel racket holder.gcode", fixtureBuffer("padel"));
  await page.getByLabel("Filament").selectOption({ label: "PLA K01" });
  await page.getByLabel("Printer").selectOption({ label: "K01 printer" });
  const cost = page.getByRole("definition");
  await expect(page.getByText("Job cost").locator("..")).toContainText("$0.77");
  await expect(page.getByText(/^Cost per piece/).locator("..")).toContainText("$0.87");
  await page.getByLabel("Your price per piece (USD)").fill("5");
  await expect(page.getByText("Profit per piece").locator("..")).toContainText("$4.13");
  await expect(cost.first()).toBeVisible();
  await checkPage(page);
  expect(await rowCounts()).toEqual(before);
  expect(uploadedFileCount()).toBe(filesBefore);
});

test("R-01/R-02 croix imports as 1 item × 4 with no typing; download returns the same bytes", async ({ page }) => {
  test.skip(!haveFixtures, "Joe's G-code fixtures are not in this checkout");
  await clearRecipes();
  const bytes = fixtureBuffer("croix");
  await page.goto("/recipes/import");
  await chooseFile(page, "new croix_PLA_1h8m.gcode", bytes);
  await expect(page.getByTestId("grams-check")).toContainText("Items add up to 8.47 g of 8.47 g.");
  await expect(page.getByLabel("Pieces on plate")).toHaveValue("4");
  await checkPage(page);
  await page.getByRole("button", { name: "Save recipe" }).click();
  await expect(page.getByRole("heading", { name: /· v1$/ })).toBeVisible();
  await expect(page.getByRole("list", { name: "Items on the plate" })).toContainText("4 × 2.118 g");
  await expect(page.getByRole("img", { name: /Plate preview/ })).toBeVisible();
  await checkPage(page);
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: /Download original file/ }).click();
  const file = await (await download).path();
  expect(sha(readFileSync(file))).toBe(sha(bytes));
});

test("R-05/R-06/R-04 two items must add up; same file is refused; overrides are logged", async ({ page }, info) => {
  await clearRecipes();
  const file = twoObjects(info.project.name);
  await page.goto("/recipes/import");
  await chooseFile(page, "two.gcode", file);
  const save = page.getByRole("button", { name: "Save recipe" });
  await page.getByLabel("Grams per piece").first().fill("3");
  await page.getByLabel("Grams per piece").last().fill("3");
  await expect(page.getByTestId("grams-check")).toContainText(
    "Items add up to 6 g but the file uses 10 g: -4 g (allowed ±2 g).",
  );
  await expect(save).toBeDisabled();
  await page.getByLabel("Grams per piece").first().fill("4");
  await page.getByLabel("Grams per piece").last().fill("6");
  await expect(save).toBeEnabled();
  await page.getByLabel("Recipe name").fill(`Hook set ${info.project.name}`);
  await save.click();
  await expect(page.getByRole("heading", { name: `Hook set ${info.project.name} · v1` })).toBeVisible();

  await page.getByLabel("Actual grams per plate").fill("10.5");
  await page.getByLabel("Hands-on minutes per plate").fill("6");
  await page.getByRole("button", { name: "Save adjustments" }).click();
  await expect(page.getByText("Using 10.5 g")).toBeVisible();
  await expect(page.getByText("grams override: — → 10.5")).toBeVisible();

  await page.goto("/recipes/import");
  await chooseFile(page, "two-again.gcode", file);
  await expect(page.getByText("Same file")).toBeVisible();
  await expect(save).toBeDisabled();
});

test("products: add a product; a part has no price field; pages pass a11y", async ({ page }, info) => {
  await page.goto("/products/new");
  await checkPage(page);
  await page.getByLabel("Type").selectOption("part");
  await expect(page.getByLabel("Sale price")).toHaveCount(0);
  await page.getByLabel("Type").selectOption("product");
  await page.getByLabel("Name", { exact: true }).fill(`Racket holder ${info.project.name}`);
  await page.getByLabel("Sale price").fill("6");
  await page.getByRole("button", { name: "Save product" }).click();
  await expect(page).toHaveURL(/\/products$/);
  const row = page.getByRole("listitem").filter({ hasText: `Racket holder ${info.project.name}` });
  await expect(row).toContainText("$6.00");
  await checkPage(page);
  await page.goto("/recipes");
  await checkPage(page);
});

test("D14 an unknown slicer's file: estimates are labelled, typed values are saved as typed", async ({
  page,
}, info) => {
  const t = `${info.project.name}-${Date.now()}`;
  const buffer = Buffer.from(syntheticMovesOnly({ header: `; made by HandRolledSlicer ${t}` }));

  await page.goto("/calculator");
  await page.getByLabel("G-code file").setInputFiles({ name: "unknown.gcode", mimeType: "text/x-gcode", buffer });
  await expect(page.getByText("Estimated values")).toBeVisible();
  await checkPage(page);

  await page.goto("/recipes/import");
  await page.getByLabel("G-code file").setInputFiles({ name: `${t}.gcode`, mimeType: "text/x-gcode", buffer });
  await expect(page.getByText("Check the estimated values")).toBeVisible();
  await page.getByLabel("Filament per plate (g)").fill("12");
  await page.getByLabel("Print time (minutes)").fill("90");
  await expect(page.getByLabel("Grams per piece")).toHaveValue("12");
  await checkPage(page);
  await page.getByLabel("Recipe name").fill(`Tag ${t}`);
  await page.getByLabel("New product name").fill(`Tag ${t}`);
  await page.getByRole("button", { name: "Save recipe" }).click();
  await expect(page.getByRole("heading", { name: `Tag ${t} · v1` })).toBeVisible();
  await expect(page.getByText("Typed at import (the app's estimate was 0.01 g).")).toBeVisible();
  await expect(page.getByText("1 h 30 min")).toBeVisible();
});
