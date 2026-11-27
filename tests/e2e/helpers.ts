import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "./test";
import { E2E_USER } from "../../playwright.config";

export async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Username").fill(E2E_USER.username);
  await page.getByLabel("Password").fill(E2E_USER.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
}

/** U-01: zero axe violations (WCAG 2.1 A/AA rules, including colour contrast). */
export async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

/**
 * U-03: every visible interactive control is at least 44×44 px on touch screens, and at least
 * 24×24 px with a mouse on desktop (WCAG 2.2 AA 2.5.8; docs/DESIGN-SYSTEM.md §4: desktop controls are 36px).
 */
export async function expectTapTargets(page: Page) {
  const small = await page.evaluate(() => {
    const min = matchMedia("(min-width: 1024px) and (pointer: fine)").matches ? 24 : 44;
    const sel = "a[href], button, input:not([type=hidden]), select, textarea, [role=button], summary";
    return [...document.querySelectorAll<HTMLElement>(sel)]
      .filter((el) => el.offsetParent !== null || getComputedStyle(el).position === "fixed")
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && r.height > 0 && (r.width < min || r.height < min))
      .map(
        ({ el, r }) =>
          `${el.tagName.toLowerCase()} "${(el.textContent ?? "").trim().slice(0, 30)}" ${Math.round(r.width)}×${Math.round(r.height)}`,
      );
  });
  expect(small).toEqual([]);
}

/** U-04: no horizontal scrolling. */
export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

export async function checkPage(page: Page) {
  await expectNoAxeViolations(page);
  await expectTapTargets(page);
  await expectNoHorizontalScroll(page);
}

/** Budget for a screen to load (production build). A hung query fails here, not after 300 s. */
export const PAGE_BUDGET_MS = Number(process.env.E2E_PAGE_BUDGET_MS ?? 5_000);

/** Collects uncaught page errors and console errors so a test can assert a screen ran cleanly. */
export function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });
  return errors;
}

/**
 * Opens a screen and checks it really loaded: 2xx/3xx, inside the time budget, a heading,
 * and not the "This screen couldn't load" error boundary.
 */
export async function openScreen(page: Page, path: string, budgetMs = PAGE_BUDGET_MS) {
  const t = Date.now();
  const res = await page.goto(path, { timeout: budgetMs * 3 });
  const ms = Date.now() - t;
  expect(res?.status() ?? 0, `${path} HTTP status`).toBeLessThan(400);
  await expect(page.locator("h1").first(), `${path} has a heading`).toBeVisible();
  await expect(page.getByText("This screen couldn't load"), `${path} error boundary`).toHaveCount(0);
  expect(ms, `${path} loaded in ${ms} ms (budget ${budgetMs} ms)`).toBeLessThan(budgetMs);
  return ms;
}

/** Supplier search on the expense form: type part of the name, pick it from the list. */
export async function pickSupplier(page: Page, name: string) {
  const box = page.getByRole("combobox", { name: "Supplier" });
  await box.fill(name.slice(0, Math.max(3, name.length - 2)));
  await page.getByRole("option", { name, exact: true }).click();
  await expect(box).toHaveValue(name);
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** R3 SearchPicker: pick an item by its label (opens it again with Change when something is already chosen). */
export async function pickIn(page: Page, label: string, item: string | RegExp) {
  const group = page.getByRole("group", { name: label, exact: true });
  const change = group.getByRole("button", { name: "Change" });
  await expect(group.getByRole("combobox").or(change)).toBeVisible();
  if (await change.isVisible()) await change.click();
  await group.getByRole("combobox").click();
  const name = typeof item === "string" ? new RegExp(`^${escapeRe(item)}`) : item;
  await group.getByRole("option", { name }).first().click();
  await expect(group.getByRole("button", { name: "Change" })).toBeVisible();
}

/** R3 Start print: recipe picker, printer card, filament picker (filament as a label or pattern). */
export async function fillStart(page: Page, s: { recipe?: string; printer: string; filament?: string | RegExp }) {
  if (s.recipe) {
    await page.getByRole("radio", { name: "Saved recipe" }).check();
    await pickIn(page, "Recipe", s.recipe);
  }
  await page.getByRole("radio", { name: new RegExp(`^${escapeRe(s.printer)}`) }).check();
  if (s.filament) await pickIn(page, "Filament", s.filament);
}

/** The running print on Today's "Needs you" list. */
export function runningPrint(page: Page, printer: string) {
  return page
    .getByRole("list", { name: "Needs you" })
    .getByRole("link")
    .filter({ hasText: ` on ${printer}` });
}

/** Click-to-edit value on a detail page (InlineEdit): open it, type or pick, save with Enter. */
export async function editInline(page: Page, label: string, value: string, opts: { select?: boolean } = {}) {
  await page.getByRole("button", { name: new RegExp(`^${escapeRe(label.toLowerCase())}: .*\\. Change$`) }).click();
  if (opts.select) {
    await page.getByRole("combobox", { name: label.toLowerCase(), exact: true }).selectOption(value);
  } else {
    const box = page.getByRole("textbox", { name: label.toLowerCase(), exact: true });
    await box.fill(value);
    await box.press("Enter");
  }
}

/** New order: type a name in the Customer search and choose "+ New customer". */
export async function newCustomerOnOrder(page: Page, name: string) {
  const group = page.getByRole("group", { name: "Customer", exact: true });
  await group.getByRole("combobox").fill(name);
  await group.getByRole("option", { name: "New customer" }).click();
  await expect(page.getByLabel("New customer name")).toHaveValue(name);
}

/** Add purchase: "+ New stock item" at the bottom of "What did you buy?", then Filament or Packaging. */
export async function newStockItem(page: Page, type: "Filament" | "Packaging") {
  const group = page.getByRole("group", { name: "What did you buy?", exact: true });
  await group.getByRole("combobox").click();
  await group.getByRole("option", { name: "New stock item" }).click();
  await page.getByRole("radio", { name: type, exact: true }).check();
}

/** Start print's "Cost of this print" panel. */
export function costPanel(page: Page) {
  return page.getByRole("region", { name: "Cost of this print" });
}

/** Order page: open "+ Add item" if it is closed, then add a product line. */
export async function addOrderItem(page: Page, product: string, qty: string, price?: string) {
  const picker = page.getByLabel("Product");
  if (!(await picker.isVisible())) await page.getByRole("button", { name: "Add item", exact: true }).click();
  await picker.selectOption({ label: product });
  await page.getByLabel("Quantity").last().fill(qty);
  if (price != null)
    await page
      .getByLabel(/^Price each/)
      .last()
      .fill(price);
  await page.getByRole("button", { name: "Add item", exact: true }).click();
}

/** Order page → Record payment page → back on the order. Leaves the page on the form when `stay` (to check errors). */
export async function recordOrderPayment(
  page: Page,
  amount: string,
  opts: { method?: string; collectedBy?: string; currency?: "USD" | "LBP"; lbpRate?: string; stay?: boolean } = {},
) {
  if (!(await page.getByRole("heading", { level: 1, name: "Record payment" }).isVisible())) {
    await page.getByRole("link", { name: "Record payment" }).first().click();
    await expect(page.getByRole("heading", { level: 1, name: "Record payment" })).toBeVisible();
  }
  await page.getByLabel("Amount").fill(amount);
  if (opts.currency) await page.getByRole("radio", { name: opts.currency }).check();
  if (opts.lbpRate != null) await page.getByLabel("LBP per USD").fill(opts.lbpRate);
  if (opts.method) await page.getByLabel("Method").selectOption(opts.method);
  if (opts.collectedBy) await page.getByLabel("Collected by").fill(opts.collectedBy);
  await page.getByRole("button", { name: "Record payment" }).click();
  if (!opts.stay) await expect(page.getByRole("heading", { level: 1, name: /^Order #\d+$/ })).toBeVisible();
}

/** Click a ConfirmButton, then its dialog's action. */
export async function confirmAction(page: Page, trigger: string | RegExp, confirm?: string) {
  await page
    .getByRole("button", { name: trigger, exact: typeof trigger === "string" })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("button", { name: confirm ?? (typeof trigger === "string" ? trigger : /./), exact: true })
    .last()
    .click();
  await expect(dialog).toBeHidden();
}

/** Order page header Deliver → confirm. Needs the driver and charge set in Details first, if any. */
export async function deliverOrder(page: Page) {
  await confirmAction(page, "Deliver", "Deliver");
  await expect(page.getByText(/^Delivered .*Stock and packaging were taken out\.$/)).toBeVisible();
}
