import { expect, test } from "./test";
import { orders, products } from "@/db/schema";
import { addPart, stockFor } from "@/server/assembly/service";
import { recordMovement } from "@/server/stock/ledger";
import { withDb } from "./db";
import { checkPage, login } from "./helpers";

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
  await page.getByLabel("Product").selectOption({ label: `Stand ${tag}` });
  await page.getByLabel("How many made").fill("2");
  await expect(page.getByText("Not enough parts in stock")).toBeVisible();
  await expect(page.getByRole("list", { name: "Parts needed" })).toContainText("4 needed · 3 on hand");
  await checkPage(page);
  await page.getByRole("button", { name: "Save assembly" }).click();
  await expect(page.getByText("Saved: 2 made. Parts taken out of stock.")).toBeVisible();

  await page.goto("/stock");
  const leg = page.getByRole("listitem").filter({ hasText: `Leg ${tag}` });
  await expect(leg).toContainText("-1 pcs");
  await expect(leg.locator(".text-danger")).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: `Stand ${tag}` })).toContainText("2 pcs");
  await checkPage(page);
});

test("H-01 change history lists edits newest first with old → new, and filters by kind", async ({ page }, info) => {
  const name = `History ${info.project.name}`;
  const [p] = await withDb((db) => db.insert(products).values({ name, salePriceUsd: 2 }).returning());
  await page.goto(`/products/${p!.id}`);
  await page.getByLabel("Sale price").fill("3");
  await page.getByRole("button", { name: "Save product" }).click();
  await expect(page).toHaveURL(/\/products$/);
  await page.goto("/history?area=stock");
  const changes = page.locator(':is(table, ul)[aria-label="Changes"]:visible');
  await expect(changes).toContainText("Sale price");
  await expect(changes).toContainText("2");
  await expect(changes).toContainText("3");
  if (info.project.name === "desktop")
    await expect(changes.getByRole("link", { name }).first()).toHaveAttribute("href", `/products/${p!.id}`);
  await checkPage(page);
});

test("T-01 Today shows printing now and orders due soon", async ({ page }, info) => {
  const due = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Beirut" });
  const [o] = await withDb((db) =>
    db
      .insert(orders)
      .values({ dueOn: due, notes: `T-01 ${info.project.name}` })
      .returning(),
  );
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Printing now" })).toBeVisible();
  await expect(
    page.getByRole("list", { name: "Orders" }).getByRole("link", { name: new RegExp(`^#${o!.id} `) }),
  ).toBeVisible();
  await checkPage(page);
});
