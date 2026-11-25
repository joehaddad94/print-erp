import { expect, test, type Page } from "./test";
import { checkPage, login, pickSupplier } from "./helpers";

test.beforeEach(async ({ page }) => {
  await login(page);
});

async function addExpense(page: Page, fill: () => Promise<void>) {
  await page.goto("/expenses/new");
  await fill();
  await page.getByRole("button", { name: "Save expense" }).click();
  await expect(page).toHaveURL(/\/expenses$/);
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
  await addExpense(page, async () => {
    await page.getByLabel("Category").selectOption("filament");
    await page.getByLabel("Amount").fill("1,790,000");
    await page.getByLabel("Currency").selectOption("LBP");
    await page.getByLabel("LBP per USD").fill("89500");
    await page.getByLabel("Material", { exact: true }).fill("PLA");
    await page.getByLabel("Colour", { exact: true }).fill(colour);
    await page.getByLabel("Grams bought").fill("1000");
  });
  const row = page.getByRole("listitem").filter({ hasText: `PLA ${colour}` });
  await expect(row).toContainText("Purchase");
  await expect(row).toContainText("$20.00");
  await checkPage(page);
});

test("E-04 editing an expense shows the Edited marker and its history; E-02 delete removes it", async ({
  page,
}, info) => {
  const note = `tape ${info.project.name}`;
  await addExpense(page, async () => {
    await page.getByLabel("Category").selectOption("other");
    await page.getByLabel("Amount").fill("4");
    await page.getByLabel("Notes").fill(note);
  });
  await page.getByRole("link").filter({ hasText: "Other" }).first().click();
  await expect(page.getByRole("heading", { name: "Edit expense" })).toBeVisible();
  await checkPage(page);
  await page.getByLabel("Amount").fill("5");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(/\/expenses$/);
  await expect(page.getByText(/✎ Edited/).first()).toBeVisible();
  await page.getByRole("link").filter({ hasText: "Other" }).first().click();
  await expect(page.getByText("amount: 4 → 5")).toBeVisible();
  await page.getByRole("button", { name: "Delete expense" }).click();
  await expect(page).toHaveURL(/\/expenses$/);
});

test("E-05 a failed save keeps every typed value", async ({ page }) => {
  await page.goto("/expenses/new");
  await page.getByLabel("Category").selectOption("filament");
  await page.getByLabel("Material", { exact: true }).fill("PETG");
  await page.getByLabel("Colour", { exact: true }).fill("Orange");
  await page.getByLabel("Notes").fill("keep me");
  await page.getByRole("button", { name: "Save expense" }).click();
  await expect(page.getByText("Enter the amount as a number")).toBeVisible();
  await expect(page.getByText("Enter the grams bought")).toBeVisible();
  await expect(page.getByLabel("Material", { exact: true })).toHaveValue("PETG");
  await expect(page.getByLabel("Notes")).toHaveValue("keep me");
});

test("S-03 purchase: search suppliers, or add a new one from the same field", async ({ page }, info) => {
  const name = `Spool corner ${info.project.name}`;
  const box = page.getByRole("combobox", { name: "Supplier" });
  await page.goto("/expenses/new");
  await page.getByLabel("Category").selectOption("other");
  await page.getByLabel("Amount").fill("7");
  await box.fill(name);
  await expect(box).toHaveAttribute("aria-expanded", "true");
  await checkPage(page);
  // Keyboard: the "add" row is offered and Enter picks it (doesn't submit the form).
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/expenses\/new$/);
  await expect(page.getByText(`New supplier: “${name}”. It's added when you save.`)).toBeVisible();
  // Clear goes back to no supplier.
  await page.getByRole("button", { name: "Clear supplier" }).click();
  await expect(box).toHaveValue("");
  await expect(page.getByLabel("New supplier's phone or link (optional)")).toHaveCount(0);
  // Tap the "add" row (phone path).
  await box.fill(name);
  await page.getByRole("option", { name: `+ Add “${name}” as a new supplier` }).click();
  await page.getByLabel("New supplier's phone or link (optional)").fill("+961 71 000 000");
  await page.getByRole("button", { name: "Save expense" }).click();
  await expect(page).toHaveURL(/\/expenses$/);
  await page.goto("/suppliers");
  await expect(page.getByRole("link").filter({ hasText: name })).toContainText("$7");

  // Next purchase: search finds it; typing the same name in other case reuses it, no duplicate.
  await page.goto("/expenses/new");
  await page.getByLabel("Category").selectOption("other");
  await page.getByLabel("Amount").fill("3");
  await pickSupplier(page, name);
  await box.fill(name.toUpperCase());
  await expect(page.getByRole("option", { name: /as a new supplier/ })).toHaveCount(0);
  await page.getByLabel("Amount").click(); // leave the field: exact name selects the existing one
  await expect(box).toHaveValue(name);
  await page.getByRole("button", { name: "Save expense" }).click();
  await expect(page).toHaveURL(/\/expenses$/);
  await page.goto("/suppliers");
  await expect(page.getByRole("link").filter({ hasText: name })).toHaveCount(1);
  await expect(page.getByRole("link").filter({ hasText: name })).toContainText("$10");
});

test("S-02 machine: edit power, history shows the change, list shows hours of life", async ({ page }, info) => {
  await page.goto("/machines");
  await checkPage(page);
  await expect(page.getByRole("link", { name: /^Ender-3 V3 SE/ })).toContainText(/0 of 3,000 h/);
  await page.getByRole("link", { name: /^Ender-3 V3 SE/ }).click();
  await checkPage(page);
  const power = info.project.name === "phone" ? "0.13" : "0.12";
  await page.getByLabel("Average power").fill(power);
  await page.getByLabel("Purchase cost").fill("200");
  await page.getByRole("button", { name: "Save machine" }).click();
  await expect(page).toHaveURL(/\/machines$/);
  await expect(page.getByRole("link", { name: /^Ender-3 V3 SE/ })).toContainText("$0.067/h");
});

test("suppliers: add one and open its page", async ({ page }, info) => {
  const name = `Filament shop ${info.project.name}`;
  await page.goto("/suppliers");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Phone or link").fill("+961 70 000 000");
  await page.getByRole("button", { name: "Add supplier" }).click();
  await expect(page.getByText(`Added ${name}.`)).toBeVisible();
  await page.getByRole("link").filter({ hasText: name }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await checkPage(page);
});
