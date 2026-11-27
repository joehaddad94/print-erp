import { ExpenseForm } from "@/components/expenses/expense-form";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/server/auth/session";
import { createExpenseAction } from "@/server/expenses/actions";
import { expenseFormOptions } from "../options";

export default async function NewExpensePage() {
  await requireUser();
  const opts = await expenseFormOptions();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Beirut" });
  return (
    <div className="flex max-w-content flex-col gap-5">
      <PageHeader back={{ href: "/expenses", label: "Expenses" }} title="Add expense" />
      <ExpenseForm
        kind="expense"
        cancelHref="/expenses"
        action={createExpenseAction}
        defaults={{ spentOn: today, currency: "USD", lbpRate: opts.lbpRate ?? "", paymentMethod: "cash" }}
        {...opts}
      />
    </div>
  );
}
