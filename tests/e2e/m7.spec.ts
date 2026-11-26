import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { strFromU8, unzipSync } from "fflate";
import { expect, test } from "./test";
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

test("R8 Download full backup builds one .zip: tables, every G-code file, checksums that match", async ({
  page,
  request,
}) => {
  await request.get("/api/cron/backup", { headers: { authorization: `Bearer ${E2E_CRON_SECRET}` } });
  await login(page);
  await page.goto("/settings");
  const panel = page.getByRole("region", { name: "Backup" });
  await expect(panel.getByText("OK", { exact: true })).toBeVisible();
  await checkPage(page);
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 60_000 }),
    page.getByRole("button", { name: "Download full backup" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^print-erp-backup-\d{4}-\d{2}-\d{2}\.zip$/);
  const files = unzipSync(new Uint8Array(await readFile((await download.path())!)));
  const dump = JSON.parse(strFromU8(files["data/backup.json"]!)) as { files: { url: string }[] };
  expect(files["data/users.csv"]).toBeDefined();
  const gcode = Object.keys(files).filter((n) => n.startsWith("gcode/"));
  expect(gcode.length).toBe(dump.files.filter((f) => f.url).length);
  const sums = strFromU8(files["checksums.txt"]!).trim().split("\n");
  expect(sums).toHaveLength(Object.keys(files).length - 1);
  for (const line of sums) {
    const [hash, name] = line.split("  ");
    expect(createHash("sha256").update(files[name!]!).digest("hex"), name).toBe(hash);
  }
  await expect(page.getByRole("status").filter({ hasText: /^Saved: / })).toBeVisible();
});

test("Data only (.json) from Settings gives the full JSON dump", async ({ page }) => {
  await login(page);
  await page.goto("/settings");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Data only (.json)" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^print-erp-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const dump = JSON.parse(await readFile((await download.path())!, "utf8")) as {
    format: number;
    tables: Record<string, { count: number }>;
  };
  expect(dump.format).toBe(1);
  expect(dump.tables.users!.count).toBeGreaterThan(0);
});

test("the backup downloads need a login", async ({ request }) => {
  expect((await request.get("/api/backup", { maxRedirects: 0 })).status()).not.toBe(200);
  expect((await request.get("/api/backup/files/1", { maxRedirects: 0 })).status()).not.toBe(200);
});

test("an unknown page shows Not found with a way back", async ({ page }) => {
  await login(page);
  await page.goto("/orders/999999999");
  await expect(page.getByRole("heading", { name: "Not found" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Go to Today" })).toBeVisible();
});
