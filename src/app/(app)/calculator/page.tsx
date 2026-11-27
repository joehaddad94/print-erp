import { CostCalculator } from "@/components/calculator/cost-calculator";
import { PageHeader } from "@/components/ui";
import { db } from "@/db";
import { requireUser } from "@/server/auth/session";
import { costInputs } from "@/server/calculator/service";
import { packagingOptions } from "@/server/products/service";
import { currentAverage } from "@/server/stock/ledger";

/** Cost calculator (prototype /calculator): price a job before you print it. Nothing is saved. */
export default async function CalculatorPage() {
  await requireUser();
  const [inputs, boxes] = await Promise.all([costInputs(db()), packagingOptions(db())]);
  const packaging = await Promise.all(
    boxes.map(async (b) => ({ ...b, costPerUnitUsd: await currentAverage(db(), b.id) })),
  );
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Cost calculator" description="Price a job before you print it. Nothing is saved." />
      <CostCalculator inputs={inputs} packaging={packaging} />
    </div>
  );
}
