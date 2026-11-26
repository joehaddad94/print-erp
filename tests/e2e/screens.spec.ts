import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "./test";
import { customers, expenses, orders, suppliers } from "@/db/schema";
import { finishJob, getJob, startJob } from "@/server/printing/service";
import { withDb } from "./db";
import { checkPage, login, openScreen, watchErrors } from "./helpers";
import { setup } from "./seed";

/**
 * Every screen, both viewports: loads inside the time budget, has a heading, no error boundary,
 * no console errors, zero axe WCAG 2.1 AA violations (light and dark), 44 px targets, no sideways scroll.
 */
const STATIC = [
  "/",
  "/print",
  "/orders",
  "/orders/new",
  "/customers",
  "/recipes",
  "/recipes/import",
  "/products",
  "/products/new",
  "/stock",
  "/machines",
  "/expenses",
  "/expenses/new",
  "/suppliers",
  "/calculator",
  "/stock/adjust",
  "/assemble",
  "/history",
  "/history?area=sales",
  "/settings",
  "/more",
];

const DETAIL = [
  "recipe",
  "product",
  "machine",
  "expense",
  "supplier",
  "customer",
  "order",
  "runningPrint",
  "finishedPrint",
] as const;
type Ids = Record<(typeof DETAIL)[number], number>;

const detailPath = (k: keyof Ids, id: number) =>
  ({
    recipe: `/recipes/${id}`,
    product: `/products/${id}`,
    machine: `/machines/${id}`,
    expense: `/expenses/${id}`,
    supplier: `/suppliers/${id}`,
    customer: `/customers/${id}`,
    order: `/orders/${id}`,
    runningPrint: `/print/${id}`,
    finishedPrint: `/print/${id}`,
  })[k];

let ids: Ids;

test.beforeAll(async ({}, info) => {
  const tag = `scr-${info.project.name}-${Date.now() % 100000}`;
  const a = await setup(`${tag}-a`);
  const b = await setup(`${tag}-b`);
  ids = await withDb(async (db) => {
    const running = await startJob(db, {
      recipeId: a.recipeId,
      machineId: a.printerId,
      filamentId: a.filamentId,
      secondFilamentId: null,
      firstFilamentGrams: null,
    });
    const finished = await startJob(db, {
      recipeId: b.recipeId,
      machineId: b.printerId,
      filamentId: b.filamentId,
      secondFilamentId: null,
      firstFilamentGrams: null,
    });
    const job = (await getJob(db, finished))!;
    await finishJob(db, finished, {
      hours: 1.8,
      hoursSource: "entered",
      stoppedAtPct: 100,
      powerCut: false,
      failureReason: null,
      good: { [job.items[0]!.line.id]: 1 },
      weighed: { [job.filaments[0]!.line.id]: null },
    });
    const [sup] = await db
      .insert(suppliers)
      .values({ name: `Shop ${tag}` })
      .returning();
    const [cust] = await db
      .insert(customers)
      .values({ name: `Client ${tag}`, phone: "+961 3 000 000" })
      .returning();
    const [ord] = await db.insert(orders).values({ customerId: cust!.id, notes: tag }).returning();
    const [exp] = await db.select({ id: expenses.id }).from(expenses).limit(1);
    return {
      recipe: a.recipeId,
      product: job.items[0]!.line.productId,
      machine: a.printerId,
      expense: exp!.id,
      supplier: sup!.id,
      customer: cust!.id,
      order: ord!.id,
      runningPrint: running,
      finishedPrint: finished,
    };
  });
});

test.beforeEach(async ({ page }) => {
  await login(page);
});

async function sweep(page: Page, path: string) {
  const errors = watchErrors(page);
  await openScreen(page, path);
  await checkPage(page);
  await page.emulateMedia({ colorScheme: "dark" });
  const dark = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(dark.violations.map((v) => `dark ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  expect(errors, `${path} console/page errors`).toEqual([]);
}

for (const path of STATIC) {
  test(`screen ${path} loads fast, clean and accessible`, async ({ page }) => {
    await sweep(page, path);
  });
}

for (const k of DETAIL) {
  test(`screen ${k} detail loads fast, clean and accessible`, async ({ page }) => {
    await sweep(page, detailPath(k, ids[k]));
  });
}

test("recipe new-version import screen (?group=) loads", async ({ page }) => {
  await page.goto(`/recipes/${ids.recipe}`);
  await page.getByRole("link", { name: "New version" }).click();
  await expect(page).toHaveURL(/\/recipes\/import\?group=/);
  await expect(page.getByRole("heading", { level: 1, name: /^New version of Holder/ })).toBeVisible();
  // The page you came from may stay mounted but hidden (React Activity); it must not be visible.
  await expect(page.locator("h1:visible")).toHaveCount(1);
  await checkPage(page);
});

test("unknown ids and slugs show Not found, never a crash", async ({ page }) => {
  for (const path of [
    "/orders/999999",
    "/orders/abc",
    "/customers/999999",
    "/products/999999",
    "/recipes/999999",
    "/machines/999999",
    "/expenses/999999",
    "/suppliers/999999",
    "/print/999999",
    "/no-such-screen",
  ]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "Not found" }), path).toBeVisible();
  }
});
