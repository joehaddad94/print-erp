import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { E2E_CRON_SECRET } from "../../playwright.config";
import { rowCounts, uploadedFileCount } from "./db";
import { checkPage, login } from "./helpers";

test("K-B1 the backup route refuses calls without the cron secret and writes one file per table with it", async ({
  request,
}) => {
  expect((await request.get("/api/cron/backup")).status()).toBe(401);
  expect((await request.get("/api/cron/backup", { headers: { authorization: "Bearer wrong" } })).status()).toBe(401);
  const before = uploadedFileCount();
  const res = await request.get("/api/cron/backup", { headers: { authorization: `Bearer ${E2E_CRON_SECRET}` } });
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { ok: boolean; files: number; tables: Record<string, number> };
  expect(body.ok).toBe(true);
  const counts = await rowCounts();
  expect(Object.keys(body.tables).sort()).toEqual(Object.keys(counts).sort());
  expect(body.files).toBe(Object.keys(counts).length + 2);
  expect(uploadedFileCount() - before).toBe(body.files);
});

test("Download backup from Settings gives the full JSON dump", async ({ page }) => {
  await login(page);
  await page.goto("/settings");
  await checkPage(page);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Download backup" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^print-erp-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const dump = JSON.parse(await readFile((await download.path())!, "utf8")) as {
    format: number;
    tables: Record<string, { count: number }>;
  };
  expect(dump.format).toBe(1);
  expect(dump.tables.users!.count).toBeGreaterThan(0);
});

test("the backup download needs a login", async ({ request }) => {
  expect((await request.get("/api/backup", { maxRedirects: 0 })).status()).not.toBe(200);
});

test("an unknown page shows Not found with a way back", async ({ page }) => {
  await login(page);
  await page.goto("/orders/999999999");
  await expect(page.getByRole("heading", { name: "Not found" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Go to Today" })).toBeVisible();
});
