import { expect, test } from "./test";
import { eq } from "drizzle-orm";
import { printJobs, recipes } from "@/db/schema";
import { startJob } from "@/server/printing/service";
import { withDb } from "./db";
import { checkPage, costPanel, fillStart, login, pickIn, runningPrint } from "./helpers";
import { setup } from "./seed";
import { syntheticGcode } from "../support/synthetic-gcode";

test.beforeEach(async ({ page }) => {
  await login(page);
});

test("J-01/J-02 golden path on the phone: Start → Finish with untouched time → $0.77, stock in", async ({
  page,
}, info) => {
  const s = await setup(`j01-${info.project.name}`);
  await page.goto("/print");
  await checkPage(page);
  await fillStart(page, { recipe: s.recipe, printer: s.printer, filament: s.filament });
  await expect(costPanel(page)).toContainText(/Job cost\s*\$0\.77/);
  await expect(costPanel(page)).toContainText(/Per piece \(\d+ on the plate\).*\$0\.87/);
  await page.getByRole("button", { name: "Start print" }).click();
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  await runningPrint(page, s.printer).click();
  await expect(page.getByRole("heading", { name: /Finish print/ })).toBeVisible();
  await checkPage(page);
  await expect(page.getByText(/G-code estimate, not checked/)).toBeVisible();
  await expect(page.getByTestId("live-cost")).toContainText(/Job cost\s*\$0\.77/);
  await page.getByRole("button", { name: "Finish print" }).click();
  await expect(page.getByRole("heading", { name: / ×\d+$/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "Cost" })).toContainText(/Job cost\s*\$0\.77/);
  await expect(page.getByText("Estimated grams").first()).toBeVisible();
  await checkPage(page);
  const [job] = await withDb((db) => db.select().from(printJobs).where(eq(printJobs.machineId, s.printerId)));
  expect(job!.hoursSource).toBe("gcode_estimate");

  // J-02 on the same job's edit form: the chip confirms, typing makes it "entered".
  await page.getByRole("link", { name: "Edit" }).click();
  await page.getByRole("button", { name: "Same as G-code" }).click();
  await expect(page.getByText(/Same as G-code \(confirmed\)/)).toBeVisible();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText(/hours source gcode_estimate → confirmed/)).toBeVisible();
  await page.getByRole("link", { name: "Edit" }).click();
  await page.getByLabel("Print time").fill("2");
  await expect(page.getByText(/Entered by you/)).toBeVisible();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText(/hours source confirmed → entered/)).toBeVisible();
});

test("J-03 busy printer: Start shows the busy message and a Finish link", async ({ page }, info) => {
  const s = await setup(`j03-${info.project.name}`);
  const jobId = await withDb((db) =>
    startJob(db, {
      recipeId: s.recipeId,
      machineId: s.printerId,
      filamentId: s.filamentId,
      secondFilamentId: null,
      firstFilamentGrams: null,
    }),
  );
  await page.goto("/print");
  const busy = page.getByRole("status").filter({ hasText: s.printer });
  await expect(busy).toContainText(`Busy: Holder j03-${info.project.name}`);
  await expect(busy.getByRole("link", { name: "Finish this print" })).toHaveAttribute("href", `/print/${jobId}`);
  await expect(page.getByRole("radio", { name: new RegExp(`^${s.printer}`) })).toBeDisabled();
});

test("J-10/J-11 mismatch warnings and a missing machine cost", async ({ page }, info) => {
  const s = await setup(`j10-${info.project.name}`, { model: "Bambu A1", nozzleMm: 0.6, purchaseAmount: null });
  await page.goto("/print");
  await fillStart(page, { recipe: s.recipe, printer: s.printer });
  await expect(page.getByText("The file was sliced for Creality Ender-3 V3 SE, not Bambu A1.")).toBeVisible();
  await expect(page.getByText(/uses a 0.4 mm nozzle/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Set the printer's purchase cost" })).toHaveAttribute(
    "href",
    `/machines/${s.printerId}`,
  );
  await checkPage(page);
});

test("J-09 Adjust stock, weigh the spool: 1014 g on the scale, 280 g empty → 734 g", async ({ page }, info) => {
  const s = await setup(`j09-${info.project.name}`);
  await page.goto("/stock/adjust");
  await pickIn(page, "Item", s.filament);
  await expect(page.getByText(`${s.filament}`).first()).toBeVisible();
  await page.getByLabel("On the scale").fill("1014");
  await page.getByLabel("Empty spool").fill("280");
  await checkPage(page);
  await page.getByRole("button", { name: "Save adjustment" }).click();
  await expect(page.getByText(`${s.filament} set to 734 g (−266 g, weighed)`)).toBeVisible();
});

test("S-01 Start from a .gcode file: saved as a recipe when the print starts; the same file is reused", async ({
  page,
}, info) => {
  const s = await setup(`s01-${info.project.name}`);
  const tag = `s01-${info.project.name}-${Date.now()}`;
  const file = {
    name: `croix-${tag}.gcode`,
    mimeType: "text/x-gcode",
    buffer: Buffer.from(syntheticGcode({ objects: [{ name: `croix-${tag}.stl`, ids: ["1", "2"] }], totalGrams: 20 })),
  };
  await page.goto("/print");
  await page.getByRole("radio", { name: "G-code file" }).check();
  await page.locator('input[type="file"]').setInputFiles(file);
  await expect(page.getByLabel("Recipe name")).toHaveValue(`croix-${tag}`);
  await expect(page.getByTestId("grams-check")).toContainText("Items add up to 20 g of 20 g.");
  await fillStart(page, { printer: s.printer });
  // Several PLA filaments are in stock, so none is picked for a new file (Joe, Nov 26).
  await expect(page.getByRole("group", { name: "Filament", exact: true }).getByRole("combobox")).toBeVisible();
  await pickIn(page, "Filament", s.filament);
  await checkPage(page);
  await page.getByRole("button", { name: "Save recipe and start print" }).click();
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  const saved = await withDb((db) =>
    db
      .select()
      .from(recipes)
      .where(eq(recipes.name, `croix-${tag}`)),
  );
  expect(saved).toHaveLength(1);
  const [job] = await withDb((db) => db.select().from(printJobs).where(eq(printJobs.machineId, s.printerId)));
  expect(job!.recipeId).toBe(saved[0]!.id);

  // The identical file again: Start uses the saved recipe and saves no copy.
  await page.goto("/print");
  await page.getByRole("radio", { name: "G-code file" }).check();
  await page.locator('input[type="file"]').setInputFiles(file);
  await expect(page.getByRole("status").filter({ hasText: "Already saved" })).toContainText(`croix-${tag} v1`);
  await expect(page.getByLabel("Recipe name")).toHaveCount(0);
});
