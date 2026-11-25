import { ExpenseForm } from "@/components/expenses/expense-form";
import { Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/server/auth/session";
import { createExpenseAction } from "@/server/expenses/actions";
import { expenseFormOptions } from "../options";

export default async function NewExpensePage() {
  await requireUser();
  const opts = await expenseFormOptions();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Beirut" });
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Add expense" />
      <Card>
        <ExpenseForm
          action={createExpenseAction}
          defaults={{ spentOn: today, currency: "USD", lbpRate: opts.lbpRate ?? "" }}
          {...opts}
        />
      </Card>
    </div>
  );
}
