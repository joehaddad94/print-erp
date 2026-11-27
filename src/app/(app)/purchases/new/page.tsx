import { redirect } from "next/navigation";
import { PurchaseForm } from "@/components/expenses/purchase-form";
import { PageHeader } from "@/components/ui";
import { db } from "@/db";
import { requireUser } from "@/server/auth/session";
import { createExpenseAction } from "@/server/expenses/actions";
import { purchaseStockOptions } from "@/server/expenses/service";
import { expenseFormOptions } from "../../expenses/options";

/**
 * Add purchase (prototype /purchases/new): filament or packaging into stock. Machines: /machines/new.
 * ?supplier=<id> pre-picks the supplier (from their page).
 */
export default async function NewPurchasePage({ searchParams }: PageProps<"/purchases/new">) {
  await requireUser();
  const sp = await searchParams;
  const preset = sp.category;
  if (preset === "machine") redirect("/machines/new");
  const [opts, stock] = await Promise.all([expenseFormOptions(), purchaseStockOptions(db())]);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Beirut" });
  return (
    <div className="flex flex-col gap-5">
      <PageHeader back={{ href: "/purchases", label: "Purchases" }} title="Add purchase" />
      <PurchaseForm
        action={createExpenseAction}
        defaults={{
          spentOn: today,
          currency: opts.currency,
          lbpRate: opts.lbpRate ?? "",
          paymentMethod: "cash",
          ...(typeof sp.supplier === "string" ? { supplierId: sp.supplier } : {}),
          ...(preset === "packaging" ? { category: "packaging" } : {}),
        }}
        stock={stock}
        suppliers={opts.suppliers}
        brands={opts.brands}
        lbpRate={opts.lbpRate}
      />
    </div>
  );
}
