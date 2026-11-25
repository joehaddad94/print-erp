import { CostCalculator } from "@/components/calculator/cost-calculator";
import { PageHeader } from "@/components/ui";
import { db } from "@/db";
import { requireUser } from "@/server/auth/session";
import { costInputs } from "@/server/calculator/service";

export default async function CalculatorPage() {
  await requireUser();
  const inputs = await costInputs(db());
  return (
    <div className="flex max-w-content flex-col gap-6">
      <PageHeader title="Cost calculator" />
      <CostCalculator inputs={inputs} />
    </div>
  );
}
