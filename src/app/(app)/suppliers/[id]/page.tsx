import { notFound } from "next/navigation";
import { ActionForm } from "@/components/form/action-form";
import { StatStrip } from "@/components/money/month-stats";
import { Icon } from "@/components/shell/icons";
import { SupplierFields } from "@/components/suppliers/supplier-fields";
import { EmptyState, HistoryList, List, ListRow, Money, PageHeader, Panel, buttonClass } from "@/components/ui";
import { Link } from "@/components/ui/link";
import { db } from "@/db";
import { formatMoney } from "@/lib/money";
import { formatPhone, whatsappUrl } from "@/lib/phone";
import { requireUser } from "@/server/auth/session";
import { historyFor } from "@/server/edits/engine";
import { CATEGORY_LABELS } from "@/server/expenses/schema";
import { saveSupplierAction } from "@/server/suppliers/actions";
import { getSupplier } from "@/server/suppliers/service";

const s = (v: string | null) => v ?? "";

/** R7 supplier: spend at a glance, every purchase, details and history. */
export default async function SupplierPage({ params }: PageProps<"/suppliers/[id]">) {
  await requireUser();
  const id = Number((await params).id);
  const sup = Number.isInteger(id) ? await getSupplier(db(), id) : null;
  if (!sup) notFound();
  const history = await historyFor(db(), "suppliers", id);
  const n = sup.bought.length;
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        back={{ href: "/suppliers", label: "Suppliers" }}
        title={sup.name}
        description={
          [sup.sells, formatPhone(sup.phone) || sup.contact, sup.area].filter(Boolean).join(" · ") || undefined
        }
        action={
          <div className="flex flex-wrap gap-2">
            {sup.phone ? (
              <a href={whatsappUrl(sup.phone)} target="_blank" rel="noreferrer" className={buttonClass("secondary")}>
                <Icon name="phone" size={15} />
                WhatsApp
              </a>
            ) : null}
            <Link href="/purchases/new" className={buttonClass("secondary")}>
              <Icon name="plus" size={15} />
              Add purchase
            </Link>
          </div>
        }
      />
      <StatStrip
        items={[
          {
            label: "Spent in total",
            value: formatMoney(sup.totalUsd, "USD"),
            note: `${n} purchase${n === 1 ? "" : "s"}`,
          },
          { label: "This year", value: formatMoney(sup.yearUsd, "USD") },
          { label: "Last purchase", value: sup.lastPurchase ?? "—" },
        ]}
      />
      <div className="grid items-start gap-5 lg:grid-aside">
        <div className="flex min-w-0 flex-col gap-5">
          <Panel title="Purchases" titleId="supplier-bought" count={n} flush>
            {n ? (
              <List label="Purchases">
                {sup.bought.map((e) => (
                  <ListRow
                    key={e.id}
                    href={`/expenses/${e.id}`}
                    title={e.description ?? CATEGORY_LABELS[e.category]}
                    subtitle={[e.spentOn, CATEGORY_LABELS[e.category]].join(" · ")}
                    trailing={<Money amount={e.amount} currency={e.currency} rateToUsd={e.rateToUsd} />}
                  />
                ))}
              </List>
            ) : (
              <EmptyState title="Nothing bought from this supplier yet" />
            )}
          </Panel>
          <Panel title="History" titleId="supplier-history">
            <HistoryList entries={history} />
          </Panel>
        </div>
        <Panel title="Details" titleId="supplier-details">
          {sup.mapUrl ? (
            <a
              href={sup.mapUrl}
              target="_blank"
              rel="noreferrer"
              className="mb-3 inline-flex min-h-control items-center gap-1.5 text-sm font-medium text-action hover:underline"
            >
              <Icon name="pin" size={14} />
              Open map pin
            </a>
          ) : null}
          <ActionForm
            action={saveSupplierAction.bind(null, id)}
            submitLabel="Save supplier"
            defaults={{
              name: sup.name,
              phone: formatPhone(sup.phone),
              sells: s(sup.sells),
              email: s(sup.email),
              website: s(sup.website),
              area: s(sup.area),
              address: s(sup.address),
              mapUrl: s(sup.mapUrl),
              notes: s(sup.notes),
            }}
          >
            <SupplierFields />
          </ActionForm>
        </Panel>
      </div>
    </div>
  );
}
