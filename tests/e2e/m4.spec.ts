import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { machines, printJobs, stockItems } from "@/db/schema";
import { expenseSchema } from "@/server/expenses/schema";
import { createExpense } from "@/server/expenses/service";
import { startJob } from "@/server/printing/service";
import { importSchema } from "@/server/recipes/schema";
import { importRecipe } from "@/server/recipes/service";
import { setSetting } from "@/server/settings/service";
import { putLocal } from "@/server/storage";
import { E2E_UPLOAD_DIR } from "../../playwright.config";
import { syntheticGcode } from "../support/synthetic-gcode";
import { withDb } from "./db";
import { checkPage, login } from "./helpers";

process.env.LOCAL_UPLOAD_DIR = E2E_UPLOAD_DIR;
delete process.env.BLOB_READ_WRITE_TOKEN;

test.beforeEach(async ({ page }) => {
  await login(page);
});

type Setup = {
  recipe: string;
  printer: string;
  filament: string;
  printerId: number;
  recipeId: number;
  filamentId: number;
};

/** A padel-shaped recipe (29.22 g, 1 piece, 6,450 s), its own printer and filament, per test. */
async function setup(tag: string, printer: Partial<typeof machines.$inferInsert> = {}): Promise<Setup> {
  return withDb(async (db) => {
    await setSetting(db, "electricity_kwh_price", 0.64);
    const name = `Holder ${tag}`;
    const text = syntheticGcode({
      objects: [{ name: `holder-${tag}.stl`, ids: ["1"] }],
      totalGrams: 29.22,
      timeSeconds: 6450,
    });
    const fileUrl = await putLocal(`${tag}.gcode`, new TextEncoder().encode(`${text}; tag ${tag} ${Date.now()}\n`));
    const r = await importRecipe(
      db,
      importSchema.parse({
        fileUrl,
        fileName: `${tag}.gcode`,
        name,
        recipeGroup: null,
        changeNote: null,
        items: [{ productId: null, newProductName: name, objectName: null, qty: 1, gramsPerPiece: 29.22 }],
      }),
    );
    const [m] = await db
      .insert(machines)
      .values({
        name: `Printer ${tag}`,
        type: "printer",
        model: "Ender-3 V3 SE",
        nozzleMm: 0.4,
        avgPowerKw: 0.12,
        purchaseAmount: 200,
        expectedLifeHours: 3000,
        ...printer,
      })
      .returning();
    await createExpense(
      db,
      expenseSchema.parse({
        spentOn: "2026-11-25",
        category: "filament",
        amount: "17.50",
        currency: "USD",
        newMaterial: "PLA",
        newColor: tag,
        grams: "1000",
      }),
    );
    return {
      recipe: `${name} · v1`,
      printer: m!.name,
      filament: `PLA ${tag}`,
      printerId: m!.id,
      recipeId: r.id,
      filamentId: (
        await db
          .select()
          .from(stockItems)
          .where(eq(stockItems.name, `PLA ${tag}`))
      )[0]!.id,
    };
  });
}

test("J-01/J-02 golden path on the phone: Start → Finish with untouched time → $0.77, stock in", async ({
  page,
}, info) => {
  const s = await setup(`j01-${info.project.name}`);
  await page.goto("/print");
  await checkPage(page);
  await page.getByLabel("Recipe").selectOption({ label: s.recipe });
  await page.getByLabel("Printer", { exact: true }).selectOption({ label: s.printer });
  await page.getByLabel("Filament", { exact: true }).selectOption({ label: `${s.filament} (1000 g left)` });
  await expect(page.getByText("Estimated cost $0.77 · $0.87 per piece")).toBeVisible();
  await page.getByRole("button", { name: "Start print" }).click();
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  await page.getByRole("link").filter({ hasText: s.printer }).first().click();
  await expect(page.getByRole("heading", { name: /Finish print/ })).toBeVisible();
  await checkPage(page);
  await expect(page.getByText(/G-code estimate, not checked/)).toBeVisible();
  await expect(page.getByTestId("live-cost")).toContainText("Job cost $0.77");
  await page.getByRole("button", { name: "Save and add to stock" }).click();
  await expect(page.getByRole("heading", { name: /^Print: / })).toBeVisible();
  await expect(page.getByText("Job cost $0.77").first()).toBeVisible();
  await expect(page.getByText("Estimated grams").first()).toBeVisible();
  const [job] = await withDb((db) => db.select().from(printJobs).where(eq(printJobs.machineId, s.printerId)));
  expect(job!.hoursSource).toBe("gcode_estimate");

  // J-02 on the same job's edit form: the chip confirms, typing makes it "entered".
  await page.getByRole("button", { name: "Same as G-code" }).click();
  await expect(page.getByText(/Same as G-code \(confirmed\)/)).toBeVisible();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("hours source: gcode_estimate → confirmed")).toBeVisible();
  await page.getByLabel("Print time (hours)").fill("2");
  await expect(page.getByText(/Entered by you/)).toBeVisible();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("hours source: confirmed → entered")).toBeVisible();
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
  await expect(page.getByLabel("Printer", { exact: true }).locator("option", { hasText: s.printer })).toHaveCount(0);
});

test("J-10/J-11 mismatch warnings and a missing machine cost", async ({ page }, info) => {
  const s = await setup(`j10-${info.project.name}`, { model: "Bambu A1", nozzleMm: 0.6, purchaseAmount: null });
  await page.goto("/print");
  await page.getByLabel("Recipe").selectOption({ label: s.recipe });
  await page.getByLabel("Printer", { exact: true }).selectOption({ label: s.printer });
  await expect(page.getByText("The file was sliced for Creality Ender-3 V3 SE, not Bambu A1.")).toBeVisible();
  await expect(page.getByText(/uses a 0.4 mm nozzle/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Set the printer's purchase cost" })).toHaveAttribute(
    "href",
    `/machines/${s.printerId}`,
  );
  await checkPage(page);
});

test("J-09 weigh filament: two spools, empty 140 g → measured 734 g", async ({ page }, info) => {
  const s = await setup(`j09-${info.project.name}`);
  await page.goto("/weigh");
  await page.getByLabel("Filament").selectOption({ label: s.filament });
  await expect(page.getByText("The app expects 1000 g on hand.")).toBeVisible();
  await page.getByLabel("Empty spool weight").fill("140");
  await page.getByLabel("Spool 1 on the scale").fill("612");
  await page.getByRole("button", { name: "Add another spool" }).click();
  await page.getByLabel("Spool 2 on the scale").fill("402");
  await checkPage(page);
  await page.getByRole("button", { name: "Save weigh-in" }).click();
  await expect(page.getByText("Saved. Measured 734 g; stock corrected by -266 g.")).toBeVisible();
});
