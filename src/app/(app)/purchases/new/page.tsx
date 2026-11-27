import { redirect } from "next/navigation";
import { PurchaseForm } from "@/components/expenses/purchase-form";
import { PageHeader } from "@/components/ui";
import { db } from "@/db";
import { requireUser } from "@/server/auth/session";
import { createExpenseAction } from "@/server/expenses/actions";
import { purchaseStockOptions } from "@/server/expenses/service";
import { expenseFormOptions } from "../../expenses/options";

/** Add purchase (prototype /purchases/new): filament or packaging into stock. Machines: /machines/new. */
export default async function NewPurchasePage({ searchParams }: PageProps<"/purchases/new">) {
  await requireUser();
  const preset = (await searchParams).category;
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
          currency: "USD",
          lbpRate: opts.lbpRate ?? "",
          paymentMethod: "cash",
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
