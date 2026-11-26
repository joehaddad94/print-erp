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
