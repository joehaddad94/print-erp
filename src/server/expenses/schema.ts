import { z } from "zod";
import { f } from "@/server/form";

export const EXPENSE_CATEGORIES = [
  "filament",
  "packaging",
  "machine",
  "electricity",
  "internet",
  "ads",
  "rent",
  "tools",
  "delivery",
  "other",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
/** R7: purchases go into stock or become a machine; running costs don't. */
export const PURCHASE_CATEGORIES = ["filament", "packaging", "machine"] as const satisfies readonly ExpenseCategory[];
export const RUNNING_CATEGORIES = [
  "electricity",
  "internet",
  "ads",
  "rent",
  "tools",
  "delivery",
  "other",
] as const satisfies readonly ExpenseCategory[];
export const isPurchase = (c: ExpenseCategory) => (PURCHASE_CATEGORIES as readonly string[]).includes(c);
export const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  filament: "Filament",
  packaging: "Packaging",
  machine: "Machine or equipment",
  electricity: "Generator or electricity",
  internet: "Internet",
  ads: "Ads",
  rent: "Rent",
  tools: "Tools",
  delivery: "Delivery",
  other: "Other",
};

const REFINE_INPUTS = new Set([
  "category",
  "currency",
  "lbpRate",
  "filamentId",
  "newMaterial",
  "newColor",
  "grams",
  "packagingId",
  "newPackagingName",
  "pieces",
  "machineName",
]);

/**
 * Add expense form (spec: expenses, D9, D23, D30, D43, D46). Filament, packaging and machine
 * categories are purchases and need their extra fields; the rest are bills.
 */
export const expenseSchema = z
  .object({
    spentOn: f.date("the date"),
    category: z.enum(EXPENSE_CATEGORIES, { error: "Choose a category" }),
    amount: f.number("the amount", { positive: true }),
    currency: f.currency(),
    lbpRate: f.optionalNumber("the LBP rate", { positive: true }),
    supplierId: f.optionalId(),
    /** R7 running costs: what, who was paid, monthly. */
    description: f.optionalText(120),
    paidTo: f.optionalText(80),
    repeatsMonthly: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
    /** The text in the supplier search box; only used to catch a name typed but never picked. */
    supplierSearch: f.optionalText(200),
    notes: f.optionalText(),
    // filament purchase
    filamentId: f.optionalId(),
    newMaterial: f.optionalText(40),
    newColor: f.optionalText(40),
    grams: f.optionalNumber("the grams", { positive: true }),
    emptySpoolWeightG: f.optionalNumber("the empty spool weight", { min: 0 }),
    // packaging purchase
    packagingId: f.optionalId(),
    newPackagingName: f.optionalText(80),
    pieces: f.optionalNumber("the number of pieces", { positive: true }),
    // machine purchase
    machineName: f.optionalText(80),
    machineType: z.enum(["printer", "equipment"]).optional(),
    machineModel: f.optionalText(80),
  })
  .superRefine(
    (v, ctx) => {
      const need = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
      if (v.supplierSearch && v.supplierId == null)
        need(
          "supplierId",
          `“${v.supplierSearch}” isn't a supplier yet. Pick one from the list, or use + New supplier.`,
        );
      if (v.currency === "LBP" && v.lbpRate == null) need("lbpRate", "Enter today's LBP per USD rate");
      if (v.category === "filament") {
        if (v.grams == null) need("grams", "Enter the grams bought");
        if (v.filamentId == null && (!v.newMaterial || !v.newColor))
          need("filamentId", "Choose a filament or enter a new material and colour");
      }
      if (v.category === "packaging") {
        if (v.pieces == null) need("pieces", "Enter how many pieces");
        if (v.packagingId == null && !v.newPackagingName)
          need("packagingId", "Choose a packaging item or name a new one");
      }
      if (v.category === "machine" && !v.machineName) need("machineName", "Name the machine");
    },
    {
      // Run the purchase checks even when an unrelated field (say, the amount) failed, so every
      // missing field is reported in one go instead of one surprise per save.
      when: (payload) => !payload.issues.some((i) => REFINE_INPUTS.has(String(i.path?.[0]))),
    },
  );

export type ExpenseInput = z.infer<typeof expenseSchema>;
