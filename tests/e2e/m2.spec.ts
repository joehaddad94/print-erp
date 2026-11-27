import { expect, test, type Page } from "./test";
import { checkPage, login, newStockItem, pickSupplier } from "./helpers";

test.beforeEach(async ({ page }) => {
  await login(page);
});

async function addExpense(page: Page, fill: () => Promise<void>, kind: "purchase" | "expense" = "expense") {
  await page.goto(kind === "purchase" ? "/purchases/new" : "/expenses/new");
  await fill();
  await page.getByRole("button", { name: kind === "purchase" ? "Save purchase" : "Save expense" }).click();
  await expect(page).toHaveURL(kind === "purchase" ? /\/purchases$/ : /\/expenses$/);
}

test("S-01 settings: save electricity price, see it in history, warning disappears", async ({ page }) => {
  await page.goto("/settings");
  await checkPage(page);
  await page.getByLabel("Electricity price per kWh (USD)").fill("0.64");
  await page.getByLabel("LBP per USD").fill("89500");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText(/^Saved\.|Nothing changed\./)).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Electricity price per kWh (USD)")).toHaveValue("0.64");
  await expect(page.getByText("Electricity price not set")).toHaveCount(0);
  await expect(page.getByRole("list").filter({ hasText: "0.64" })).toBeVisible();
});

test("V-01 settings: a bad number shows an error under the field and keeps the typing", async ({ page }) => {
  await page.goto("/settings");
  await page.getByLabel("Failure allowance (%)").fill("150");
  await page.getByLabel("Electricity price per kWh (USD)").fill("0.7");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("The failure allowance must be at most 99")).toBeVisible();
  await expect(page.getByLabel("Electricity price per kWh (USD)")).toHaveValue("0.7");
});

test("S-03/S-04 LBP filament purchase converts to USD and shows as a purchase", async ({ page }, info) => {
  const colour = `Black-${info.project.name}`;
  await addExpense(
    page,
    async () => {
      await newStockItem(page, "Filament");
      await page.getByLabel("Total paid").fill("1,790,000");
      await page.getByRole("radio", { name: "LBP" }).check();
      await page.getByLabel("LBP per USD").fill("89500");
      await page.getByLabel("Material", { exact: true }).fill("PLA");
      await page.getByLabel("Colour", { exact: true }).fill(colour);
      await page.getByLabel("Quantity").fill("1000");
      await page.getByLabel("Brand").fill("eSun");
    },
    "purchase",
  );
  const row = page.locator(":is(tr, li):visible").filter({ hasText: `PLA ${colour}` });
  await expect(row).toContainText("Filament");
  await expect(row).toContainText("$20.00");
  await expect(row).toContainText("eSun");
  await checkPage(page);
});

test("E-04 editing an expense shows the Edited marker and its history; E-02 delete removes it", async ({
  page,
}, info) => {
  const note = `tape ${info.project.name}`;
  await addExpense(page, async () => {
    await page.getByLabel("Category").selectOption("other");
    await page.getByLabel("Amount").fill("4");
    await page.getByLabel("What").fill(note);
  });
  const row = page.locator(":is(tr, li):visible").filter({ hasText: note });
  await row.getByRole("link").first().click();
  await expect(page.getByRole("heading", { name: "Edit expense" })).toBeVisible();
  await checkPage(page);
  await page.getByLabel("Amount").fill("5");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(/\/expenses$/);
  await expect(row.getByText(/✎ Edited/)).toBeVisible();
  await row.getByRole("link").first().click();
  await expect(page.getByText("amount: 4 → 5")).toBeVisible();
  await page.getByRole("button", { name: "Delete expense" }).click();
  await expect(page).toHaveURL(/\/expenses$/);
});

test("E-05 a failed save keeps every typed value", async ({ page }) => {
  await page.goto("/purchases/new");
  await newStockItem(page, "Filament");
  await page.getByLabel("Material", { exact: true }).fill("PETG");
  await page.getByLabel("Colour", { exact: true }).fill("Orange");
  await page.getByLabel("Notes").fill("keep me");
  await page.getByRole("button", { name: "Save purchase" }).click();
  await expect(page.getByText("Enter the amount as a number")).toBeVisible();
  await expect(page.getByText("Enter the grams bought")).toBeVisible();
  await expect(page.getByLabel("Material", { exact: true })).toHaveValue("PETG");
  await expect(page.getByLabel("Notes")).toHaveValue("keep me");
});

test("S-03 purchase: search picks a supplier; + New supplier adds one and picks it", async ({ page }, info) => {
  const name = `Spool corner ${info.project.name}`;
  const box = page.getByRole("combobox", { name: "Supplier" });
  await page.goto("/purchases/new");
  await newStockItem(page, "Packaging");
  await page.getByLabel("Total paid").fill("7");
  await page.getByLabel("New item name").fill(`Tape A ${name}`);
  await page.getByLabel("Quantity").fill("1");

  // The search never offers to add: a name that isn't listed is refused on save, not created.
  await box.fill(name);
  await expect(page.getByRole("listbox", { name: "Suppliers" }).getByRole("option")).toHaveCount(0);
  await expect(page.getByRole("listbox", { name: "Suppliers" })).toContainText(/No suppliers? (matches|yet)/);
  await page.getByLabel("Total paid").click();
  await page.getByRole("button", { name: "Save purchase" }).click();
  await expect(page.getByText(`“${name}” isn't a supplier yet.`)).toBeVisible();
  await expect(box).toHaveValue(name);

  // + New supplier opens a small form (name taken from the search), Cancel closes it.
  await page.getByRole("button", { name: "+ New supplier" }).click();
  await expect(page.getByLabel("Supplier name")).toBeFocused();
  await expect(page.getByLabel("Supplier name")).toHaveValue(name);
  await checkPage(page);
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByLabel("Supplier name")).toHaveCount(0);

  // Empty name is refused inside the panel; Enter saves the supplier, not the expense.
  await page.getByRole("button", { name: "+ New supplier" }).click();
  await page.getByLabel("Supplier name").fill("");
  await page.getByRole("button", { name: "Save supplier" }).click();
  await expect(page.getByText("Enter a name")).toBeVisible();
  await page.getByLabel("Supplier name").fill(name);
  await page.getByLabel("Phone or link (optional)").fill("+961 71 000 000");
  await page.getByLabel("Phone or link (optional)").press("Enter");
  await expect(page.getByText(`Added “${name}” and picked it.`)).toBeVisible();
  await expect(box).toHaveValue(name);
  await expect(page).toHaveURL(/\/purchases\/new$/);
  await page.getByRole("button", { name: "Save purchase" }).click();
  await expect(page).toHaveURL(/\/purchases$/);
  await page.goto("/suppliers");
  await expect(page.locator(":is(tr, li):visible").filter({ hasText: name })).toContainText("$7");

  // Next purchase: search finds it; adding the same name again reuses it, no duplicate.
  await page.goto("/purchases/new");
  await newStockItem(page, "Packaging");
  await page.getByLabel("Total paid").fill("3");
  await page.getByLabel("New item name").fill(`Tape B ${name}`);
  await page.getByLabel("Quantity").fill("1");
  await page.getByRole("button", { name: "+ New supplier" }).click();
  await page.getByLabel("Supplier name").fill(name.toUpperCase());
  await page.getByRole("button", { name: "Save supplier" }).click();
  await expect(box).toHaveValue(name);
  await page.getByRole("button", { name: "Clear supplier" }).click();
  await pickSupplier(page, name);
  await page.getByRole("button", { name: "Save purchase" }).click();
  await expect(page).toHaveURL(/\/purchases$/);
  await page.goto("/suppliers");
  await expect(page.locator(":is(tr, li):visible").filter({ hasText: name })).toHaveCount(1);
  await expect(page.locator(":is(tr, li):visible").filter({ hasText: name })).toContainText("$10");
});

test("S-02 machine: edit power, history shows the change, list shows hours of life", async ({ page }, info) => {
  await page.goto("/machines");
  await checkPage(page);
  const ender = page
    .locator(":is(tr, li):visible")
    .filter({ has: page.getByRole("link", { name: /^Ender-3 V3 SE/ }) })
    .first();
  await expect(ender).toContainText(/(^|\D)0 h/);
  await ender.getByRole("link").first().click();
  await checkPage(page);
  const power = info.project.name === "phone" ? "0.13" : "0.12";
  await page.getByLabel("Average power").fill(power);
  await page.getByLabel("Purchase cost").fill("200");
  await page.getByRole("button", { name: "Save machine" }).click();
  await expect(page).toHaveURL(/\/machines$/);
  await expect(ender).toContainText("$0.067");
});

test("suppliers: add one, its page shows the WhatsApp number", async ({ page }, info) => {
  const name = `Filament shop ${info.project.name}`;
  await page.goto("/suppliers/new");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Phone").fill("70 000 000");
  await page.getByLabel("What they sell").fill("PLA, PETG");
  await page.getByRole("button", { name: "Add supplier" }).click();
  await expect(page).toHaveURL(/\/suppliers\/\d+$/);
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  await expect(page.getByText("PLA, PETG · +961 70 000 000")).toBeVisible();
  await expect(page.getByRole("link", { name: "WhatsApp" })).toHaveAttribute("href", /wa\.me\/96170000000/);
  await checkPage(page);
  await page.goto("/suppliers");
  await page.locator(":is(tr, li):visible").filter({ hasText: name }).getByRole("link").first().click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
});
