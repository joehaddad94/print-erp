import { expect, test, type Page } from "./test";
import { products } from "@/db/schema";
import { addPart } from "@/server/assembly/service";
import {
  addOrderItem,
  checkPage,
  confirmAction,
  editInline,
  fillStart,
  login,
  newCustomerOnOrder,
  newStockItem,
  pickIn,
  pickSupplier,
  recordOrderPayment,
  runningPrint,
} from "./helpers";
import { withDb } from "./db";
import { setup } from "./seed";

/**
 * Create, validate, edit (✎ Edited + history) and delete on the screens the milestone specs left thin:
 * customers, suppliers, products, machines, orders, payments, prints, weigh-ins and assembly.
 */
test.beforeEach(async ({ page }) => {
  await login(page);
});

const uid = (info: { project: { name: string } }) => `${info.project.name}-${Date.now() % 1_000_000}`;

async function newOrder(page: Page, customer: string) {
  await page.goto("/orders/new");
  await newCustomerOnOrder(page, customer);
  await page.getByRole("button", { name: "Create order" }).click();
  await expect(page.getByRole("heading", { name: /^Order #\d+$/ })).toBeVisible();
  return Number((await page.getByRole("heading", { name: /^Order #\d+$/ }).textContent())!.replace(/\D/g, ""));
}

test.describe("customers", () => {
  test("empty name is refused; add, open, edit, history shows old → new", async ({ page }, info) => {
    const name = `Rana ${uid(info)}`;
    await page.goto("/customers");
    await page.getByRole("link", { name: "Add customer" }).click();
    await page.getByRole("button", { name: "Add customer" }).click();
    await expect(page.getByText("Enter a name")).toBeVisible();

    await page.getByLabel("Name").fill(name);
    await page.getByLabel("Phone").fill("12");
    await page.getByLabel("Email").fill("not an email");
    await page.getByRole("button", { name: "Add customer" }).click();
    await expect(page.getByText("Enter a Lebanese number like 70 123 456")).toBeVisible();
    await expect(page.getByText("Enter an email like name@example.com")).toBeVisible();
    await page.getByLabel("Phone").fill("071 111 111");
    await page.getByLabel("Email").fill("rana@example.com");
    await page.getByLabel("Instagram").fill("@rana");
    await page.getByRole("button", { name: "Add customer" }).click();
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
    await expect(page.getByRole("button", { name: "phone: +961 71 111 111. Change" })).toBeVisible();
    await expect(page.getByText("No orders yet")).toBeVisible();
    await checkPage(page);

    await editInline(page, "Phone", "71 222 222");
    await expect(page.getByRole("button", { name: "phone: +961 71 222 222. Change" })).toBeVisible();
    await page.goto("/history?area=sales");
    await expect(
      page.locator(":is(tr, li):visible").filter({ hasText: name }).filter({ hasText: "+96171222222" }).first(),
    ).toBeVisible();
    await page.goto("/customers");
    await expect(page.locator(":is(tr, li):visible").filter({ hasText: name })).toContainText("+961 71 222 222");
  });

  test("a customer's page lists their orders and balance owed", async ({ page }, info) => {
    const name = `Owes ${uid(info)}`;
    const product = `Keychain ${uid(info)}`;
    await withDb((db) => db.insert(products).values({ name: product, salePriceUsd: 3 }));
    await newOrder(page, name);
    await addOrderItem(page, `${product} · $3.00`, "2");
    await expect(page.getByText("Line added.")).toBeVisible();
    await page.getByRole("link", { name, exact: true }).first().click();
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
    await expect(page.getByText("Owes you", { exact: true }).locator("..")).toContainText("$6.00");
    await expect(page.locator(':is(table, ul)[aria-label="Orders"]:visible')).toContainText("$6.00");
    await page.goto("/customers");
    await expect(page.locator(":is(tr, li):visible").filter({ hasText: name })).toContainText("$6.00");
  });
});

test.describe("suppliers", () => {
  test("empty name is refused; edit is logged; purchases from the supplier are listed with a total", async ({
    page,
  }, info) => {
    const name = `Supplier ${uid(info)}`;
    await page.goto("/suppliers/new");
    await page.getByRole("button", { name: "Add supplier" }).click();
    await expect(page.getByText("Enter a name")).toBeVisible();
    await page.getByLabel("Name").fill(name);
    await page.getByLabel("Phone").fill("12");
    await page.getByRole("button", { name: "Add supplier" }).click();
    await expect(page.getByLabel("Phone")).toHaveAttribute("aria-invalid", "true");
    await page.getByLabel("Phone").fill("");
    await page.getByRole("button", { name: "Add supplier" }).click();
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();

    await page.goto("/purchases/new");
    await newStockItem(page, "Packaging");
    await page.getByLabel("Total paid").fill("12.5");
    await page.getByLabel("New item name").fill(`Bag ${uid(info)}`);
    await page.getByLabel("Quantity").fill("5");
    await pickSupplier(page, name);
    await page.getByRole("button", { name: "Save purchase" }).click();
    await expect(page).toHaveURL(/\/purchases$/);

    await page.goto("/suppliers");
    await page.locator(":is(tr, li):visible").filter({ hasText: name }).getByRole("link").first().click();
    await expect(page.getByText("Spent in total").locator("..")).toContainText("$12.50");
    await expect(page.locator(':is(table, ul)[aria-label="Purchases"]:visible')).toContainText("$12.50");
    await editInline(page, "Sells", "Bags");
    await expect(page.getByRole("button", { name: "sells: Bags. Change" })).toBeVisible();
    await page.goto("/history?area=money");
    await expect(
      page.locator(":is(tr, li):visible").filter({ hasText: name }).filter({ hasText: "Bags" }).first(),
    ).toBeVisible();
  });
});

test.describe("products", () => {
  test("empty name and a negative price are refused, typing is kept; edit shows ✎ Edited in the list", async ({
    page,
  }, info) => {
    const name = `Vase ${uid(info)}`;
    await page.goto("/products/new");
    await page.getByLabel("Sale price").fill("-2");
    await page.getByRole("button", { name: "Save product" }).click();
    await expect(page.getByText("Enter a name")).toBeVisible();
    await expect(page.getByText("The sale price must be at least 0")).toBeVisible();
    await expect(page.getByLabel("Sale price")).toHaveValue("-2");

    await page.getByLabel("Name", { exact: true }).fill(name);
    await page.getByLabel("Sale price").fill("");
    await page.getByRole("button", { name: "Save product" }).click();
    await expect(page).toHaveURL(/\/products$/);
    const row = page.locator(":is(tr, li):visible").filter({ hasText: name });
    await expect(row).toContainText("No price");
    await expect(row).not.toContainText("Edited");

    await row.getByRole("link").first().click();
    await editInline(page, "Sale price", "-1");
    await expect(page.getByText("The sale price must be at least 0")).toBeVisible();
    await page.getByRole("textbox", { name: "sale price", exact: true }).press("Escape");
    await editInline(page, "Sale price", "9");
    await expect(page.getByRole("button", { name: /^sale price: \$9\.00/ })).toBeVisible();
    await page.goto("/products");
    await expect(row).toContainText("$9.00");
    await expect(row).toContainText("✎ Edited");
  });

  test("labels point at the visible field even when an earlier form is still mounted but hidden", async ({
    page,
  }, info) => {
    // Next keeps visited routes mounted (React Activity). With id={name}, the edit page's "Sale price"
    // label pointed at the hidden "new product" input: tapping it did nothing and screen readers got no name.
    const name = `Label ${uid(info)}`;
    await page.goto("/products/new");
    await page.getByLabel("Name", { exact: true }).fill(name);
    await page.getByRole("button", { name: "Save product" }).click();
    await expect(page).toHaveURL(/\/products$/);
    await page.locator(":is(tr, li):visible").filter({ hasText: name }).getByRole("link").first().click();
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
    await page.getByRole("button", { name: /^sale price: / }).click();
    await expect(page.getByRole("textbox", { name: "sale price", exact: true })).toBeFocused();
    const ids = await page.evaluate(() => {
      const all = [...document.querySelectorAll("[id]")].map((e) => e.id);
      return all.filter((id, i) => all.indexOf(id) !== i);
    });
    expect(ids, "duplicate DOM ids").toEqual([]);
  });

  test("parts list: add a part to a product, then remove it", async ({ page }, info) => {
    const t = uid(info);
    const [p] = await withDb((db) =>
      db
        .insert(products)
        .values([
          { name: `Lamp ${t}`, salePriceUsd: 20 },
          { name: `Shade ${t}`, kind: "part" },
        ])
        .returning(),
    );
    await page.goto(`/products/${p!.id}`);
    await expect(page.getByText("Printed in one piece.")).toBeVisible();
    await page.getByRole("button", { name: "Add part" }).click();
    await page.getByLabel("Part", { exact: true }).selectOption({ label: `Shade ${t}` });
    await page.getByLabel("Per product").fill("2");
    await page.getByRole("button", { name: "Add part" }).click();
    await expect(page.getByRole("list", { name: "Parts list" })).toContainText(`2 × Shade ${t}`);
    await checkPage(page);
    await page.getByRole("list", { name: "Parts list" }).getByRole("button", { name: "Remove" }).click();
    await expect(page.getByText("Printed in one piece.")).toBeVisible();
  });
});

test.describe("machines", () => {
  test("buying a machine through Add expense creates it; bad numbers are refused; retiring is logged", async ({
    page,
  }, info) => {
    const name = `Dryer ${uid(info)}`;
    await page.goto("/machines/new");
    await page.getByLabel("Purchase cost").fill("45");
    await page.getByLabel("Name", { exact: true }).fill(name);
    await page.getByRole("radio", { name: "Equipment" }).check();
    await page.getByRole("button", { name: "Save machine" }).click();
    await expect(page).toHaveURL(/\/machines$/);

    await page.goto("/machines");
    await page.locator(":is(tr, li):visible").filter({ hasText: name }).getByRole("link").first().click();
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
    await expect(page.getByLabel("Purchase cost")).toHaveValue("45");
    await page.getByLabel("Average power").fill("-1");
    await page.getByLabel("Name").fill("");
    await page.getByRole("button", { name: "Save machine" }).click();
    await expect(page.getByText("Enter a name")).toBeVisible();
    await expect(page.getByText("The average power must be more than 0")).toBeVisible();

    await page.getByLabel("Name").fill(name);
    await page.getByLabel("Average power").fill("");
    await page.getByRole("radio", { name: "Retired" }).check();
    await page.getByRole("button", { name: "Save machine" }).click();
    await expect(page).toHaveURL(/\/machines$/);
    const row = page.locator(":is(tr, li):visible").filter({ hasText: name });
    await expect(row).toContainText("Retired");
    await expect(row).toContainText("✎ Edited");
  });
});

test.describe("orders", () => {
  test("line edit, order details edit, ✎ Edited in the list, payment validation, refund, cancel", async ({
    page,
  }, info) => {
    const t = uid(info);
    const product = `Coaster ${t}`;
    await withDb((db) => db.insert(products).values({ name: product, salePriceUsd: 4 }));
    const id = await newOrder(page, `Order client ${t}`);

    // Add line: quantity must be a whole number above 0.
    await addOrderItem(page, `${product} · $4.00`, "1.5");
    await expect(page.getByText("Enter a whole number")).toBeVisible();
    await addOrderItem(page, `${product} · $4.00`, "3", "0");
    await expect(page.getByRole("button", { name: "quantity: 3 ×. Change" })).toBeVisible();
    await expect(page.getByRole("button", { name: "price each: $0.00 each. Change" })).toBeVisible();

    // Edit the line in place: price back to $4; a fraction is refused.
    await editInline(page, "price each", "4");
    await expect(page.getByRole("button", { name: "price each: $4.00 each. Change" })).toBeVisible();
    await expect(page.getByText("Total (items only)").locator("..")).toContainText("$12.00");
    await editInline(page, "quantity", "2.5");
    await expect(page.getByText("Enter a whole number")).toBeVisible();
    await page.getByRole("textbox", { name: "quantity", exact: true }).press("Escape");

    // Edit order details in place: channel + due date (typed dd/mm/yyyy), logged in History.
    await editInline(page, "Channel", "instagram", { select: true });
    await expect(page.getByText("Channel WhatsApp → Instagram")).toBeVisible();
    await editInline(page, "Due", "15/01/2030");
    await expect(page.getByText(/due 15 Jan/).first()).toBeVisible();
    await page.goto("/orders");
    await expect(page.getByRole("link").filter({ hasText: `#${id} ` })).toContainText("✎ Edited");
    await page.goto(`/orders/${id}`);

    // Payments (own page, amount pre-filled with the balance): 0 is refused, LBP needs a rate, a refund is negative.
    await page.getByRole("link", { name: "Record payment" }).first().click();
    await expect(page.getByLabel("Amount")).toHaveValue("12");
    await recordOrderPayment(page, "0", { stay: true });
    await expect(page.getByText("The amount can't be 0. A refund is negative.")).toBeVisible();
    await recordOrderPayment(page, "447,500", { currency: "LBP", lbpRate: "", stay: true });
    await expect(page.getByText("Enter today's LBP per USD rate")).toBeVisible();
    await recordOrderPayment(page, "447,500", { currency: "LBP", lbpRate: "89500" });
    await expect(page.getByText("Received").locator("..")).toContainText("$5.00");
    await expect(page.getByText("Partly paid").first()).toBeVisible();

    await recordOrderPayment(page, "-1", { currency: "USD" });
    await expect(page.getByText(/^Refund · /)).toBeVisible();
    await expect(page.getByText("Received").locator("..")).toContainText("$4.00");
    await page.getByRole("button", { name: "Delete payment" }).last().click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete payment" }).click();
    await expect(page.getByText(/^Refund · /)).toHaveCount(0);

    // Remove the line, then cancel the order: both ask first; "Keep it" changes nothing.
    await page.getByRole("button", { name: `Remove ${product}` }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Keep it" }).click();
    await expect(page.getByRole("button", { name: "quantity: 3 ×. Change" })).toBeVisible();
    await confirmAction(page, `Remove ${product}`, "Remove line");
    await expect(page.getByText("No items yet.")).toBeVisible();
    await confirmAction(page, "Cancel order");
    await expect(page.getByText("Cancelled", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Record payment" })).toHaveCount(0);
  });

  test("status buttons move an open order along", async ({ page }, info) => {
    await newOrder(page, `Status ${uid(info)}`);
    const status = page.getByRole("region", { name: "Status" });
    const current = status.getByRole("button", { disabled: true });
    await expect(current).toHaveCount(1);
    const was = (await current.textContent())!.trim();
    const next = status
      .getByRole("button", { disabled: false })
      .filter({ hasNotText: /Cancel order|Delete order/ })
      .first();
    const target = (await next.textContent())!.trim();
    await next.click();
    await expect(status.getByRole("button", { name: target })).toBeDisabled();
    await expect(status.getByRole("button", { name: was })).toBeEnabled();
    await expect(page.getByText(/^Status (Quoted|Confirmed) → /).first()).toBeVisible();
  });

  test("delete order removes it from the list", async ({ page }, info) => {
    const id = await newOrder(page, `Delete ${uid(info)}`);
    await confirmAction(page, "Delete order");
    await expect(page).toHaveURL(/\/orders$/);
    await expect(page.getByRole("link").filter({ hasText: `#${id} ` })).toHaveCount(0);
  });
});

test.describe("prints", () => {
  test("finish validation; a failed print (0 good, stopped at 40%) books waste, not stock", async ({ page }, info) => {
    const s = await setup(`fail-${uid(info)}`);
    await page.goto("/print");
    await fillStart(page, { recipe: s.recipe, printer: s.printer, filament: s.filament });
    await page.getByRole("button", { name: "Start print" }).click();
    await runningPrint(page, s.printer).click();

    await page.getByLabel("Print time").fill("");
    await page.getByLabel("Stopped early").check();
    await page.getByLabel("How far it got").fill("140");
    await page.getByRole("button", { name: "Finish print" }).click();
    await expect(page.getByText("Enter the print time as a number")).toBeVisible();
    await expect(page.getByText("How far it got must be at most 100")).toBeVisible();

    await page.getByLabel("Print time").fill("0.7");
    await page.getByLabel("How far it got").fill("40");
    await page.getByLabel(/\(of 1\)$/).fill("0");
    await page.getByLabel("Power cut during the print").check();
    await page.getByLabel("What went wrong").fill("power cut, layer shift");
    await expect(page.getByTestId("live-cost")).toContainText("nothing to stock");
    await page.getByRole("button", { name: "Finish print" }).click();
    await expect(page.getByRole("heading", { name: / ×\d+$/ })).toBeVisible();
    await expect(page.getByRole("region", { name: "Cost" })).toContainText(/Waste\s*\$/);
    await page.goto("/stock");
    await expect(page.locator(":is(tr, li):visible").filter({ hasText: s.recipe.replace(" · v1", "") })).toHaveCount(0);
  });

  test("busy printer can't start twice even if the form is posted twice", async ({ page }, info) => {
    const s = await setup(`dbl-${uid(info)}`);
    await page.goto("/print");
    await fillStart(page, { recipe: s.recipe, printer: s.printer, filament: s.filament });
    const start = page.getByRole("button", { name: "Start print" });
    await start.dblclick();
    await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
    await expect(runningPrint(page, s.printer)).toHaveCount(1);
  });
});

test.describe("weigh and assemble validation", () => {
  test("Adjust stock needs an item; Weigh filament now opens Adjust stock", async ({ page }) => {
    await page.goto("/weigh");
    await expect(page).toHaveURL(/\/stock\/adjust$/);
    await page.getByRole("button", { name: "Save adjustment" }).click();
    await expect(page.getByText("Choose a stock item")).toBeVisible();
  });

  test("assemble needs a whole number", async ({ page }, info) => {
    const t = uid(info);
    await withDb(async (db) => {
      const [stand, leg] = await db
        .insert(products)
        .values([
          { name: `Easel ${t}`, salePriceUsd: 8 },
          { name: `Easel leg ${t}`, kind: "part" },
        ])
        .returning();
      await addPart(db, stand!.id, leg!.id, 3);
    });
    await page.goto("/assemble");
    await pickIn(page, "Product", `Easel ${t}`);
    await page.getByLabel("How many made").fill("1.5");
    await page.getByRole("button", { name: "Save assembly" }).click();
    await expect(page.getByText("Enter a whole number")).toBeVisible();
    await expect(page.getByLabel("How many made")).toHaveValue("1.5");
  });
});
