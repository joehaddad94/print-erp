import { ALL_ITEMS } from "@/components/shell/nav";
import { login } from "./helpers";
import { expect, test } from "./test";

/**
 * No-hang under concurrency. The app keeps a small pool (max 5); behind a transaction pooler a leaked
 * or stuck connection shows up as requests that never answer. 40 requests at once must all finish fast.
 */
const BUDGET_MS = 15_000;

test("40 concurrent screen loads all answer 200 within the budget", async ({ page }) => {
  test.setTimeout(60_000);
  await login(page);
  const paths = ALL_ITEMS.map((i) => i.href);
  const t = Date.now();
  const results = await Promise.all(
    Array.from({ length: 40 }, async (_, k) => {
      const path = paths[k % paths.length]!;
      const start = Date.now();
      const res = await page.request.get(path, { timeout: BUDGET_MS, maxRedirects: 0 });
      return { path, status: res.status(), ms: Date.now() - start };
    }),
  );
  const slowest = Math.max(...results.map((r) => r.ms));
  console.log(`40 requests in ${Date.now() - t} ms, slowest ${slowest} ms`);
  expect(results.filter((r) => r.status !== 200)).toEqual([]);
  expect(slowest).toBeLessThan(BUDGET_MS);
});

test("health stays up under 50 concurrent checks", async ({ request }) => {
  const results = await Promise.all(
    Array.from({ length: 50 }, () => request.get("/api/health", { timeout: BUDGET_MS }).then((r) => r.status())),
  );
  expect(results.every((s) => s === 200)).toBe(true);
});
