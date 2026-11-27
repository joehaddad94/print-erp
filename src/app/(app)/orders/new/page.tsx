import { NewOrderForm } from "@/components/orders/new-order-form";
import { PageHeader } from "@/components/ui";
import { db } from "@/db";
import { requireUser } from "@/server/auth/session";
import { listCustomers } from "@/server/orders/service";
import { productTable } from "@/server/products/catalogue";
import { orderFormOptions } from "../options";

/** New order (prototype /orders/new). ?customer=<id> pre-picks the customer (from their page). */
export default async function NewOrderPage({ searchParams }: PageProps<"/orders/new">) {
  await requireUser();
  const customer = (await searchParams).customer;
  const [opts, customers, products] = await Promise.all([orderFormOptions(), listCustomers(db()), productTable(db())]);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader back={{ href: "/orders", label: "Orders" }} title="New order" />
      <NewOrderForm
        lbpRate={opts.lbpRate}
        defaults={{
          channel: "whatsapp",
          status: "confirmed",
          currency: "USD",
          lbpRate: opts.lbpRate ?? "",
          customerId: typeof customer === "string" ? customer : "",
        }}
        customers={customers.map((c) => ({
          id: c.id,
          name: c.name,
          sub: [c.phone, c.handle, c.area].filter(Boolean).join(" · "),
        }))}
        products={products
          .filter((p) => p.type !== "part")
          .map((p) => ({
            id: p.id,
            name: p.name,
            variant: p.variant,
            priceUsd: p.salePriceUsd,
            costEachUsd: p.costEachUsd,
            free: p.free,
          }))}
      />
    </div>
  );
}
