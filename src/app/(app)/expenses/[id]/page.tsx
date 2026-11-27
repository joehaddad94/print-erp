import { notFound } from "next/navigation";
import { ExpenseForm } from "@/components/expenses/expense-form";
import { Button, HistoryList, PageHeader } from "@/components/ui";
import { db } from "@/db";
import { requireUser } from "@/server/auth/session";
import { historyFor } from "@/server/edits/engine";
import { deleteExpenseAction, updateExpenseAction } from "@/server/expenses/actions";
import { isPurchase } from "@/server/expenses/schema";
import { getExpense } from "@/server/expenses/service";
import { expenseFormOptions } from "../options";

export default async function EditExpensePage({ params }: PageProps<"/expenses/[id]">) {
  await requireUser();
  const id = Number((await params).id);
  const e = Number.isInteger(id) ? await getExpense(db(), id) : null;
  if (!e) notFound();
  const [opts, history] = await Promise.all([expenseFormOptions(), historyFor(db(), "expenses", id)]);
  const purchase = isPurchase(e.category);
  const qty = e.purchaseQty == null ? "" : String(e.purchaseQty);
  return (
    <div className="flex max-w-content flex-col gap-6">
      <PageHeader
        back={purchase ? { href: "/purchases", label: "Purchases" } : { href: "/expenses", label: "Expenses" }}
        title={purchase ? "Edit purchase" : "Edit expense"}
      />
      <ExpenseForm
        editing
        cancelHref={purchase ? "/purchases" : "/expenses"}
        action={updateExpenseAction.bind(null, id)}
        defaults={{
          category: e.category,
          amount: String(e.amount),
          spentOn: e.spentOn,
          currency: e.currency,
          lbpRate: e.currency === "LBP" ? String(Math.round(1 / e.rateToUsd)) : "",
          supplierId: e.supplierId == null ? "" : String(e.supplierId),
          notes: e.notes ?? "",
          description: e.description ?? "",
          paidTo: e.paidTo ?? "",
          paymentMethod: e.paymentMethod ?? "",
          repeatsMonthly: String(e.repeatsMonthly),
          filamentId: e.category === "filament" && e.stockItemId ? String(e.stockItemId) : "",
          packagingId: e.category === "packaging" && e.stockItemId ? String(e.stockItemId) : "",
          grams: e.category === "filament" ? qty : "",
          brand: e.brand ?? "",
          pieces: e.category === "packaging" ? qty : "",
        }}
        {...opts}
      />
      <form action={deleteExpenseAction.bind(null, id)}>
        <Button type="submit" variant="danger" block>
          {purchase ? "Delete purchase" : "Delete expense"}
        </Button>
      </form>
      <section aria-labelledby="expense-history" className="flex flex-col gap-2">
        <h2 id="expense-history" className="text-lg font-semibold">
          History
        </h2>
        <HistoryList entries={history} />
      </section>
    </div>
  );
}
