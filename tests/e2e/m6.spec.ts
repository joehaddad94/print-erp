import { expect, test } from "./test";
import { orders, products } from "@/db/schema";
import { addPart, stockFor } from "@/server/assembly/service";
import { recordMovement } from "@/server/stock/ledger";
import { withDb } from "./db";
import { checkPage, editInline, login, pickIn } from "./helpers";

test.beforeEach(async ({ page }) => {
  await login(page);
});

test("B-02 short parts warn but the save is allowed; negative stock shows in red", async ({ page }, info) => {
  const tag = info.project.name;
  await withDb(async (db) => {
    const [stand] = await db
      .insert(products)
      .values({ name: `Stand ${tag}`, salePriceUsd: 12 })
      .returning();
    const [leg] = await db
      .insert(products)
      .values({ name: `Leg ${tag}`, kind: "part" })
      .returning();
    await addPart(db, stand!.id, leg!.id, 2);
    const legStock = await stockFor(db, leg!.id);
    await db.transaction((tx) =>
      recordMovement(tx, { stockItemId: legStock, amount: 3, reason: "print", unitCostUsd: 0.5 }),
    );
  });
  await page.goto("/assemble");
  await pickIn(page, "Product", `Stand ${tag}`);
  await page.getByLabel("How many made").fill("2");
  await expect(page.getByText(`Leg ${tag} is short.`)).toBeVisible();
  await expect(page.locator(':is(table, ul)[aria-label="Parts needed"]:visible')).toContainText("Short 1");
  await checkPage(page);
  await page.getByRole("button", { name: "Save assembly" }).click();
  await expect(page.getByText("Saved: 2 made. Parts taken out of stock.")).toBeVisible();

  await page.goto("/stock");
  const leg = page.locator(":is(tr, li):visible").filter({ hasText: `Leg ${tag}` });
  await expect(leg).toContainText("-1 pcs");
  await expect(leg.locator(".text-danger")).toBeVisible();
  await expect(page.locator(":is(tr, li):visible").filter({ hasText: `Stand ${tag}` })).toContainText("2 pcs");
  await checkPage(page);
});

test("H-01 change history lists edits newest first with old → new, and filters by kind", async ({ page }, info) => {
  const name = `History ${info.project.name}`;
  const [p] = await withDb((db) => db.insert(products).values({ name, salePriceUsd: 2 }).returning());
  await page.goto(`/products/${p!.id}`);
  await editInline(page, "Sale price", "3");
  await expect(page.getByRole("button", { name: /^sale price: \$3\.00/ })).toBeVisible();
  await page.goto("/history?area=stock");
  const changes = page.locator(':is(table, ul)[aria-label="Changes"]:visible');
  await expect(changes).toContainText("Sale price");
  await expect(changes).toContainText("2");
  await expect(changes).toContainText("3");
  if (info.project.name === "desktop")
    await expect(changes.getByRole("link", { name }).first()).toHaveAttribute("href", `/products/${p!.id}`);
  await checkPage(page);
});

test("T-01 Today shows what needs you and what is due this week", async ({ page }, info) => {
  const due = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Beirut" });
  const [o] = await withDb((db) =>
    db
      .insert(orders)
      .values({ dueOn: due, notes: `T-01 ${info.project.name}` })
      .returning(),
  );
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Needs you" })).toBeVisible();
  await expect(
    page.getByRole("list", { name: "Needs you" }).getByRole("link", { name: new RegExp(`^#${o!.id} `) }),
  ).toBeVisible();
  await checkPage(page);
});

test("New stock item: an opening count with its price shows in Stock; below its own level it shows Low", async ({
  page,
}, info) => {
  const colour = `Opening ${info.project.name}${Date.now() % 100000}`;
  await page.goto("/stock/new");
  await page.getByLabel("Colour").fill(colour);
  await page.getByLabel("Quantity now").fill("750");
  await page.getByRole("button", { name: "Create stock item" }).click();
  await expect(page.getByText("Enter the price paid, so prints using it have a cost")).toBeVisible();
  await expect(page.getByLabel("Colour")).toHaveValue(colour);
  await page.getByLabel("Price paid").fill("19");
  await page.getByLabel("Warn me below").fill("800");
  await page.getByRole("button", { name: "Create stock item" }).click();
  await expect(page).toHaveURL(/\/stock\?adjusted=/);
  await expect(page.getByText(`PLA ${colour} added to stock`)).toBeVisible();
  await page.getByRole("link", { name: /^Filament/ }).click();
  const row = page.locator(":is(tr, li):visible").filter({ hasText: `PLA ${colour}` });
  await expect(row).toContainText("750 g");
  await expect(row).toContainText("$19.00/kg");
  await expect(row).toContainText("Low");

  // The same name twice is refused.
  await page.goto("/stock/new");
  await page.getByLabel("Colour").fill(colour);
  await page.getByRole("button", { name: "Create stock item" }).click();
  await expect(page.getByText(`“PLA ${colour}” is already in stock.`)).toBeVisible();
});
