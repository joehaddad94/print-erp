import { z } from "zod";
import { f } from "@/server/form";

/** Products screen (D19, D25, D31). A part is never sold, so it has no price and no packaging. */
export const productSchema = z
  .object({
    name: f.text("a name", 80),
    variant: f.optionalText(60),
    kind: z.enum(["product", "part"], { error: "Choose product or part" }),
    salePriceUsd: f.optionalNumber("the sale price", { min: 0 }),
    packagingItemId: f.optionalId(),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "part" && v.salePriceUsd != null)
      ctx.addIssue({ code: "custom", path: ["salePriceUsd"], message: "A part is not sold, so it has no price" });
    if (v.kind === "part" && v.packagingItemId != null)
      ctx.addIssue({ code: "custom", path: ["packagingItemId"], message: "A part has no packaging" });
  });

export type ProductInput = z.infer<typeof productSchema>;
