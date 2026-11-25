import { z } from "zod";
import { f } from "@/server/form";

/** One plate item on import (D17): an existing product/part, or a new one named here. */
export const importItemSchema = z
  .object({
    productId: z.number().int().positive().nullable(),
    newProductName: z.string().trim().max(80).nullable(),
    newProductKind: z.enum(["product", "part"]).default("product"),
    objectName: z.string().max(300).nullable(),
    qty: z.number({ error: "Enter how many are on the plate" }).int("Pieces must be a whole number").positive(),
    gramsPerPiece: z.number({ error: "Enter grams per piece" }).positive("Grams per piece must be more than 0"),
  })
  .refine((i) => i.productId != null || !!i.newProductName, {
    message: "Choose a product or name a new one",
    path: ["productId"],
  });

/** Sent by the import screen as one JSON field after the file is uploaded. */
export const importSchema = z.object({
  fileUrl: z.string().min(1).max(2000),
  fileName: z.string().trim().min(1).max(255),
  name: z.string().trim().min(1, "Enter a recipe name").max(80),
  recipeGroup: z.uuid().nullable(),
  changeNote: z
    .string()
    .trim()
    .max(500)
    .nullable()
    .transform((v) => v || null),
  items: z.array(importItemSchema).min(1, "Add at least one item"),
  /** Joe's values for what the file didn't state. Ignored for values the file does state. */
  confirmed: z
    .object({
      totalGrams: z.number().positive("Enter the grams per plate").nullable(),
      estimatedSeconds: z.number().positive("Enter the print time").nullable(),
    })
    .optional(),
});

export type ImportInput = z.infer<typeof importSchema>;

/** D15 overrides: blank = use the file's value / the setting. */
export const overridesSchema = z.object({
  gramsOverride: f.optionalNumber("the grams per plate", { positive: true }),
  wasteAllowancePctOverride: f
    .optionalNumber("the waste allowance", { min: 0 })
    .refine((v) => v == null || v < 100, "The waste allowance must be below 100"),
  labourMinutes: f.optionalNumber("the hands-on minutes", { min: 0 }),
  stepsAndTips: f.optionalText(4000),
});

export type OverridesInput = z.infer<typeof overridesSchema>;
