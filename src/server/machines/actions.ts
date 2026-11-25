"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { machines } from "@/db/schema";
import { rateToUsdFromLbpRate } from "@/lib/money";
import { requireUser } from "@/server/auth/session";
import { updateLogged } from "@/server/edits/engine";
import { f, failure, formValues, validate, type FormState } from "@/server/form";

const schema = z
  .object({
    name: f.text("a name", 80),
    model: f.optionalText(80),
    type: z.enum(["printer", "equipment"]),
    status: z.enum(["active", "retired"]),
    purchaseAmount: f.optionalNumber("the purchase cost", { min: 0 }),
    currency: f.currency(),
    lbpRate: f.optionalNumber("the LBP rate", { positive: true }),
    expectedLifeHours: f.optionalNumber("the expected life", { positive: true }),
    avgPowerKw: f.optionalNumber("the average power", { positive: true }),
    nozzleMm: f.optionalNumber("the nozzle size", { positive: true }),
    bedXMm: f.optionalNumber("the bed width", { positive: true }),
    bedYMm: f.optionalNumber("the bed depth", { positive: true }),
    notes: f.optionalText(),
  })
  .superRefine((v, ctx) => {
    if (v.currency === "LBP" && v.lbpRate == null)
      ctx.addIssue({ code: "custom", path: ["lbpRate"], message: "Enter the LBP per USD rate" });
  });

/** D26/D27: changes apply to jobs started after them (each job snapshots), and are logged (D13). */
export async function saveMachineAction(id: number, _prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const values = formValues(fd);
  const v = validate(schema, values);
  if (!v.ok) return v.state;
  const d = v.data;
  try {
    await db().transaction((tx) =>
      updateLogged(
        tx,
        machines,
        id,
        {
          name: d.name,
          model: d.model,
          type: d.type,
          status: d.status,
          purchaseAmount: d.purchaseAmount,
          purchaseCurrency: d.currency,
          purchaseRateToUsd: d.currency === "USD" ? 1 : rateToUsdFromLbpRate(d.lbpRate!),
          expectedLifeHours: d.expectedLifeHours,
          avgPowerKw: d.avgPowerKw,
          nozzleMm: d.nozzleMm,
          bedXMm: d.bedXMm == null ? null : Math.round(d.bedXMm),
          bedYMm: d.bedYMm == null ? null : Math.round(d.bedYMm),
          notes: d.notes,
        },
        { userId: user.id },
      ),
    );
  } catch {
    return failure(values, "Couldn't save. Check your connection and try again.");
  }
  revalidatePath("/machines");
  redirect("/machines");
}
