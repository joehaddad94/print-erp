import { expect, test, type Page } from "./test";
import { products } from "@/db/schema";
import { addPart } from "@/server/assembly/service";
import { checkPage, fillStart, login, pickSupplier, runningPrint } from "./helpers";
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
  await page.getByLabel("New customer name").fill(customer);
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
    await page.getByLabel("Instagram or other").fill("@rana");
    await page.getByRole("button", { name: "Add customer" }).click();
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
    await expect(page.getByLabel("Phone")).toHaveValue("+961 71 111 111");
    await expect(page.getByText("No orders yet")).toBeVisible();
    await checkPage(page);

    await page.getByLabel("Phone").fill("71 222 222");
    await page.getByRole("button", { name: "Save customer" }).click();
    await expect(page.getByText("phone: +96171111111 → +96171222222")).toBeVisible();
    await page.goto("/customers");
    await expect(page.locator(":is(tr, li):visible").filter({ hasText: name })).toContainText("+961 71 222 222");
  });

  test("a customer's page lists their orders and balance owed", async ({ page }, info) => {
    const name = `Owes ${uid(info)}`;
    const product = `Keychain ${uid(info)}`;
    await withDb((db) => db.insert(products).values({ name: product, salePriceUsd: 3 }));
    await newOrder(page, name);
    await page.getByLabel("Product").selectOption({ label: `${product} · $3.00` });
    await page.getByLabel("Quantity").last().fill("2");
    await page.getByRole("button", { name: "Add item" }).click();
    await expect(page.getByText("Line added.")).toBeVisible();
    await page.getByRole("link", { name, exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
    await expect(page.getByText("Balance owed").locator("..")).toContainText("$6.00");
    await expect(page.getByRole("list", { name: "Orders" })).toContainText(name);
    await page.goto("/customers");
    await expect(page.locator(":is(tr, li):visible").filter({ hasText: name })).toContainText("$6.00");
  });
});

test.describe("suppliers", () => {
  test("empty name is refused; edit is logged; purchases from the supplier are listed with a total", async ({
    page,
  }, info) => {
    const name = `Supplier ${uid(info)}`;
    await page.goto("/suppliers");
    await page.getByRole("button", { name: "Add supplier" }).click();
    await expect(page.getByText("Enter a name")).toBeVisible();
    await page.getByLabel("Name").fill(name);
    await page.getByRole("button", { name: "Add supplier" }).click();
    await expect(page.getByText(`Added ${name}.`)).toBeVisible();

    await page.goto("/expenses/new");
    await page.getByLabel("Category").selectOption("other");
    await page.getByLabel("Amount").fill("12.5");
    await pickSupplier(page, name);
    await page.getByRole("button", { name: "Save expense" }).click();
    await expect(page).toHaveURL(/\/expenses$/);

    await page.goto("/suppliers");
    await page.getByRole("link").filter({ hasText: name }).click();
    await expect(page.getByRole("heading", { name: /Bought:/ })).toContainText("$12.50");
    await expect(page.getByRole("list", { name: "Purchases" })).toContainText("Other");
    await page.getByLabel("Phone or link").fill("instagram.com/shop");
    await page.getByRole("button", { name: "Save supplier" }).click();
    await expect(page).toHaveURL(/\/suppliers$/);
    await page.getByRole("link").filter({ hasText: name }).click();
    await expect(page.getByText("contact: — → instagram.com/shop")).toBeVisible();
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
    const row = page.getByRole("listitem").filter({ hasText: name });
    await expect(row).toContainText("No price");
    await expect(row).not.toContainText("Edited");

    await row.getByRole("link").click();
    await page.getByLabel("Sale price").fill("9");
    await page.getByRole("button", { name: "Save product" }).click();
    await expect(page).toHaveURL(/\/products$/);
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
    await page.getByRole("listitem").filter({ hasText: name }).getByRole("link").click();
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
    await page.locator("label:visible", { hasText: /^Sale price$/ }).click();
    await expect(page.getByRole("textbox", { name: "Sale price" })).toBeFocused();
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
    await page.goto("/expenses/new");
    await page.getByLabel("Category").selectOption("machine");
    await page.getByLabel("Amount").fill("45");
    await page.getByLabel("Name").fill(name);
    await page.getByLabel("Type").selectOption("equipment");
    await page.getByRole("button", { name: "Save expense" }).click();
    await expect(page).toHaveURL(/\/expenses$/);

    await page.goto("/machines");
    await page.getByRole("link").filter({ hasText: name }).click();
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
    await expect(page.getByLabel("Purchase cost")).toHaveValue("45");
    await page.getByLabel("Average power").fill("-1");
    await page.getByLabel("Name").fill("");
    await page.getByRole("button", { name: "Save machine" }).click();
    await expect(page.getByText("Enter a name")).toBeVisible();
    await expect(page.getByText("The average power must be more than 0")).toBeVisible();

    await page.getByLabel("Name").fill(name);
    await page.getByLabel("Average power").fill("");
    await page.getByLabel("Status").selectOption("retired");
    await page.getByRole("button", { name: "Save machine" }).click();
    await expect(page).toHaveURL(/\/machines$/);
    const row = page.getByRole("link").filter({ hasText: name });
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
    await page.getByLabel("Product").selectOption({ label: `${product} · $4.00` });
    await page.getByLabel("Quantity").last().fill("1.5");
    await page.getByRole("button", { name: "Add item" }).click();
    await expect(page.getByText("Enter a whole number")).toBeVisible();
    await page.getByLabel("Quantity").last().fill("3");
    await page.getByLabel("Price each (USD)").last().fill("0");
    await page.getByRole("button", { name: "Add item" }).click();
    await expect(page.getByText("3 × " + product)).toBeVisible();
    await expect(page.getByText("$0.00 each")).toBeVisible();

    // Edit the line: price back to $4.
    await page.getByText("Edit line").click();
    await page.getByLabel("Price each (USD)").first().fill("4");
    await page.getByRole("button", { name: "Save line" }).click();
    await expect(page.getByText("$4.00 each")).toBeVisible();
    await expect(page.getByText("Total (items only)").locator("..")).toContainText("$12.00");

    // Edit order details: channel + due date, logged in History.
    await page.getByText("Edit order details").click();
    await page.getByLabel("Channel").selectOption("instagram");
    await page.getByLabel("Due").fill("2030-01-15");
    await page.getByRole("button", { name: "Save order" }).click();
    await expect(page.getByText("channel: whatsapp → instagram")).toBeVisible();
    await expect(page.getByText(/due 2030-01-15/).first()).toBeVisible();
    await page.goto("/orders");
    await expect(page.getByRole("link").filter({ hasText: `#${id} ` })).toContainText("✎ Edited");
    await page.goto(`/orders/${id}`);

    // Payments: 0 is refused, LBP needs a rate, a refund is negative.
    await page.getByLabel("Amount").fill("0");
    await page.getByRole("button", { name: "Record payment" }).click();
    await expect(page.getByText("The amount can't be 0. A refund is negative.")).toBeVisible();
    await page.getByLabel("Amount").fill("447,500");
    await page.getByLabel("Currency").last().selectOption("LBP");
    await page.getByLabel("LBP per USD").last().fill("");
    await page.getByRole("button", { name: "Record payment" }).click();
    await expect(page.getByText("Enter today's LBP per USD rate")).toBeVisible();
    await page.getByLabel("LBP per USD").last().fill("89500");
    await page.getByRole("button", { name: "Record payment" }).click();
    await expect(page.getByText("Payment recorded.")).toBeVisible();
    await expect(page.getByText("Received").locator("..")).toContainText("$5.00");
    await expect(page.getByText("Partly paid").first()).toBeVisible();

    await page.getByLabel("Amount").fill("-1");
    await page.getByLabel("Currency").last().selectOption("USD");
    await page.getByRole("button", { name: "Record payment" }).click();
    await expect(page.getByText(/^Refund /)).toBeVisible();
    await expect(page.getByText("Received").locator("..")).toContainText("$4.00");
    await page.getByRole("button", { name: "Delete payment" }).last().click();
    await expect(page.getByText(/^Refund /)).toHaveCount(0);

    // Remove the line, then cancel the order.
    await page.getByText("Edit line").click();
    await page.getByRole("button", { name: "Remove line" }).click();
    await expect(page.getByText("No items yet.")).toBeVisible();
    await page.getByRole("button", { name: "Cancel order" }).click();
    await expect(page.getByText("Cancelled", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Record payment" })).toHaveCount(0);
  });

  test("status buttons move an open order along", async ({ page }, info) => {
    await newOrder(page, `Status ${uid(info)}`);
    const status = page.getByRole("heading", { name: "Status" }).locator("..");
    const current = status.getByRole("button", { disabled: true });
    await expect(current).toHaveCount(1);
    const was = (await current.textContent())!.trim();
    const next = status.getByRole("button", { disabled: false }).filter({ hasNotText: "Cancel order" }).first();
    const target = (await next.textContent())!.trim();
    await next.click();
    await expect(status.getByRole("button", { name: target })).toBeDisabled();
    await expect(status.getByRole("button", { name: was })).toBeEnabled();
    await expect(page.getByText(`status: `).first()).toBeVisible();
  });

  test("delete order removes it from the list", async ({ page }, info) => {
    const id = await newOrder(page, `Delete ${uid(info)}`);
    await page.getByText("Edit order details").click();
    await page.getByRole("button", { name: "Delete order" }).click();
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

    await page.getByLabel("Print time (hours)").fill("");
    await page.getByLabel("Stopped early").check();
    await page.getByLabel("How far it got (%)").fill("140");
    await page.getByRole("button", { name: "Finish print" }).click();
    await expect(page.getByText("Enter the print time as a number")).toBeVisible();
    await expect(page.getByText("How far it got must be at most 100")).toBeVisible();

    await page.getByLabel("Print time (hours)").fill("0.7");
    await page.getByLabel("How far it got (%)").fill("40");
    await page.getByLabel(/\(of 1\)$/).fill("0");
    await page.getByLabel("Power cut during the print").check();
    await page.getByLabel("What went wrong").fill("power cut, layer shift");
    await expect(page.getByTestId("live-cost")).toContainText("nothing good");
    await page.getByRole("button", { name: "Finish print" }).click();
    await expect(page.getByRole("heading", { name: /^Print: / })).toBeVisible();
    await expect(page.getByText(/waste \$/).first()).toBeVisible();
    await page.goto("/stock");
    await expect(page.getByRole("listitem").filter({ hasText: s.recipe.replace(" · v1", "") })).toHaveCount(0);
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
  test("weigh-in needs a filament, an empty-spool weight and a reading", async ({ page }) => {
    await page.goto("/weigh");
    await page.getByRole("button", { name: "Save weigh-in" }).click();
    await expect(page.getByRole("alert").or(page.locator("[id$=-error]")).first()).toBeVisible();
    await expect(page).toHaveURL(/\/weigh$/);
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
    await page.getByLabel("Product").selectOption({ label: `Easel ${t}` });
    await page.getByLabel("How many made").fill("1.5");
    await page.getByRole("button", { name: "Save assembly" }).click();
    await expect(page.getByText("Enter a whole number")).toBeVisible();
    await expect(page.getByLabel("How many made")).toHaveValue("1.5");
  });
});
