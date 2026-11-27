import { notFound } from "next/navigation";
import { Icon } from "@/components/shell/icons";
import { DataTable, EmptyState, InlineDetails, PageHeader, Panel, StatStrip, buttonClass } from "@/components/ui";
import type { Column } from "@/components/ui";
import { Link } from "@/components/ui/link";
import { MapPinLink } from "@/components/ui/map-pin-link";
import { db } from "@/db";
import { formatMoney } from "@/lib/money";
import { formatPhone, whatsappUrl } from "@/lib/phone";
import { requireUser } from "@/server/auth/session";
import { CATEGORY_LABELS } from "@/server/expenses/schema";
import { listExpenses } from "@/server/expenses/service";
import { updateSupplierFieldAction } from "@/server/suppliers/actions";
import { getSupplier } from "@/server/suppliers/service";

type Row = Awaited<ReturnType<typeof listExpenses>>[number];
const s = (v: string | null) => v ?? "";
const usd = (n: number) => formatMoney(n, "USD");
const paid = (e: Row) => e.amount * e.rateToUsd;
const day = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const item = (e: Row) => e.boughtName ?? e.description ?? CATEGORY_LABELS[e.category];
const qty = (e: Row) =>
  e.category === "machine"
    ? "1"
    : e.purchaseQty == null
      ? "—"
      : `${Number(e.purchaseQty).toLocaleString("en-US")} ${e.unit === "grams" ? "g" : "pcs"}`;
const perKg = (e: Row) => (paid(e) * 1000) / e.purchaseQty!;
const unit = (e: Row) =>
  e.category === "machine"
    ? usd(paid(e))
    : e.purchaseQty
      ? e.unit === "grams"
        ? `${usd(perKg(e))}/kg`
        : `${usd(paid(e) / e.purchaseQty)} each`
      : "—";

/** Supplier (prototype /suppliers/1): spend at a glance, every purchase, click-to-edit details. */
export default async function SupplierPage({ params }: PageProps<"/suppliers/[id]">) {
  await requireUser();
  const id = Number((await params).id);
  const sup = Number.isInteger(id) ? await getSupplier(db(), id) : null;
  if (!sup) notFound();
  const rows = (await listExpenses(db())).filter((e) => e.supplierId === id);
  const n = rows.length;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Beirut" });
  const month = rows.filter((e) => e.spentOn.startsWith(today.slice(0, 7)));
  const monthName = new Date().toLocaleDateString("en-GB", { month: "long", timeZone: "Asia/Beirut" });
  // Last price paid per kg for filament, and the one before it for the same material.
  const fil = rows.filter((e) => e.category === "filament" && e.purchaseQty);
  const last = fil[0];
  const material = last?.boughtName?.split(" ")[0];
  const before = last ? fil.slice(1).find((e) => e.boughtName?.split(" ")[0] === material) : undefined;
  const columns: Column<Row>[] = [
    { key: "date", header: "Date", cell: (e) => day(e.spentOn) },
    {
      key: "item",
      header: "Item",
      cell: (e) => <span className="font-medium">{item(e)}</span>,
    },
    { key: "qty", header: "Quantity", numeric: true, cell: qty },
    { key: "unit", header: "Unit price", numeric: true, cell: unit },
    { key: "usd", header: "USD", numeric: true, cell: (e) => usd(paid(e)) },
  ];
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        back={{ href: "/suppliers", label: "Suppliers" }}
        title={sup.name}
        description={[formatPhone(sup.phone) || sup.contact, sup.sells].filter(Boolean).join(" · ") || undefined}
        action={
          <div className="flex flex-wrap gap-2 *:flex-1 sm:*:flex-none">
            {sup.phone ? (
              <a href={whatsappUrl(sup.phone)} target="_blank" rel="noreferrer" className={buttonClass("secondary")}>
                <Icon name="phone" size={15} />
                WhatsApp
              </a>
            ) : null}
            <Link href={`/purchases/new?supplier=${id}`} className={buttonClass("secondary")}>
              <Icon name="plus" size={15} />
              Add purchase
            </Link>
          </div>
        }
      />
      <StatStrip
        items={[
          { label: "Spent in total", value: usd(sup.totalUsd), note: `${n} purchase${n === 1 ? "" : "s"}` },
          { label: "This month", value: usd(month.reduce((t, e) => t + paid(e), 0)), note: monthName },
          {
            label: material ? `${material} price last paid` : "Filament price last paid",
            value: last ? `${usd(perKg(last))}/kg` : "—",
            note: before
              ? `was ${usd(perKg(before))} on ${day(before.spentOn)}`
              : last
                ? item(last)
                : "no filament yet",
          },
          {
            label: "Last purchase",
            value: rows[0] ? day(rows[0].spentOn) : "—",
            note: rows[0]
              ? [item(rows[0]), rows[0].purchaseQty ? qty(rows[0]) : null].filter(Boolean).join(" ")
              : undefined,
          },
        ]}
      />
      <div className="grid items-start gap-5 lg:grid-aside">
        <Panel title="Purchases" titleId="supplier-bought" count={n} flush>
          {n ? (
            <DataTable
              id="supplier-purchases"
              label="Purchases"
              columns={columns}
              rows={rows}
              rowKey={(e) => e.id}
              rowHref={(e) => `/expenses/${e.id}`}
              phoneRow={(e) => ({
                title: e.purchaseQty ? `${item(e)} · ${qty(e)}` : item(e),
                subtitle: `${day(e.spentOn)} · ${unit(e)}`,
                trailing: usd(paid(e)),
              })}
            />
          ) : (
            <EmptyState title="Nothing bought from this supplier yet" />
          )}
        </Panel>
        <Panel title="Details" titleId="supplier-details">
          <InlineDetails
            save={updateSupplierFieldAction.bind(null, id)}
            rows={[
              { field: "name", label: "Name", value: sup.name, wide: true },
              { field: "phone", label: "Phone", value: formatPhone(sup.phone), inputMode: "tel", wide: true },
              { field: "sells", label: "Sells", value: s(sup.sells), wide: true },
              { field: "email", label: "Email", value: s(sup.email), inputMode: "email", wide: true },
              { field: "website", label: "Website or Instagram", value: s(sup.website), wide: true },
              { field: "area", label: "Area", value: s(sup.area) },
              { field: "address", label: "Address", value: s(sup.address), wide: true },
              {
                field: "mapUrl",
                label: "Map pin",
                value: s(sup.mapUrl),
                display: "Change",
                wide: true,
                before: sup.mapUrl ? <MapPinLink href={sup.mapUrl} /> : null,
              },
              { field: "notes", label: "Notes", value: s(sup.notes), wide: true },
            ]}
            footer="Click any value to change it. Every change is saved in History."
          />
        </Panel>
      </div>
    </div>
  );
}
