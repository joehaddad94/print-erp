import { ExpenseForm } from "@/components/expenses/expense-form";
import { Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/server/auth/session";
import { createExpenseAction } from "@/server/expenses/actions";
import { expenseFormOptions } from "../../expenses/options";

/** R7 Add purchase: filament, packaging or a machine. Adds stock (or the machine) in the same save. */
export default async function NewPurchasePage({ searchParams }: PageProps<"/purchases/new">) {
  await requireUser();
  const preset = (await searchParams).category;
  const category = preset === "machine" || preset === "filament" || preset === "packaging" ? preset : undefined;
  const opts = await expenseFormOptions();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Beirut" });
  return (
    <div className="flex max-w-content flex-col gap-5">
      <PageHeader back={{ href: "/purchases", label: "Purchases" }} title="Add purchase" />
      <Card>
        <ExpenseForm
          kind="purchase"
          action={createExpenseAction}
          defaults={{ spentOn: today, currency: "USD", lbpRate: opts.lbpRate ?? "", ...(category ? { category } : {}) }}
          {...opts}
        />
      </Card>
    </div>
  );
}
