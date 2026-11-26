import { Icon } from "@/components/shell/icons";
import { StatStrip } from "@/components/money/month-stats";
import { Pills } from "@/components/money/pills";
import {
  Badge,
  DataTable,
  EditedMarker,
  EmptyState,
  Money,
  PageHeader,
  Panel,
  buttonClass,
  type Column,
} from "@/components/ui";
import { Link } from "@/components/ui/link";
import { db } from "@/db";
import { formatMoney } from "@/lib/money";
import { requireUser } from "@/server/auth/session";
import { CATEGORY_LABELS, PURCHASE_CATEGORIES } from "@/server/expenses/schema";
import { listExpenses } from "@/server/expenses/service";

type Row = Awaited<ReturnType<typeof listExpenses>>[number];
const usd = (n: number) => formatMoney(n, "USD");
const qty = (r: Row) =>
  r.purchaseQty == null ? "—" : `${Number(r.purchaseQty).toLocaleString("en-US")} ${r.unit === "grams" ? "g" : "pcs"}`;
const month = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Beirut" }).slice(0, 7);

/** R7 Purchases: what goes into stock or becomes a machine. Its cost reaches profit when you print and sell. */
export default async function PurchasesPage({ searchParams }: PageProps<"/purchases">) {
  await requireUser();
  const c = (await searchParams).category;
  const all = (await listExpenses(db())).filter((e) => e.isPurchase);
  const cat = PURCHASE_CATEGORIES.find((x) => x === c);
  const rows = cat ? all.filter((e) => e.category === cat) : all;
  const now = all.filter((e) => e.spentOn.startsWith(month()));
  const sum = (xs: Row[]) => xs.reduce((s, e) => s + e.amount * e.rateToUsd, 0);
  const of = (k: Row["category"]) => now.filter((e) => e.category === k);
  const columns: Column<Row>[] = [
    { key: "date", header: "Date", cell: (e) => e.spentOn },
    {
      key: "item",
      header: "Item",
      cell: (e) => (
        <span className="flex flex-wrap items-center gap-2">
          <Link
            href={`/expenses/${e.id}`}
            className="inline-flex min-h-6 items-center font-medium text-action hover:underline"
          >
            {e.boughtName ?? CATEGORY_LABELS[e.category]}
          </Link>
          {e.brand ? <span className="text-ink-muted">{e.brand}</span> : null}
          <EditedMarker at={e.editedAt} />
        </span>
      ),
    },
    { key: "type", header: "Type", cell: (e) => <Badge>{CATEGORY_LABELS[e.category]}</Badge> },
    { key: "qty", header: "Quantity", numeric: true, cell: qty },
    {
      key: "unit",
      header: "Unit price",
      numeric: true,
      lo: true,
      cell: (e) =>
        e.purchaseQty
          ? e.unit === "grams"
            ? `${usd((e.amount * e.rateToUsd * 1000) / e.purchaseQty)}/kg`
            : `${usd((e.amount * e.rateToUsd) / e.purchaseQty)} each`
          : "—",
    },
    {
      key: "paid",
      header: "Paid",
      numeric: true,
      cell: (e) => <Money amount={e.amount} currency={e.currency} rateToUsd={e.rateToUsd} />,
    },
    { key: "supplier", header: "Supplier", lo: true, cell: (e) => e.supplierName ?? "—" },
    { key: "notes", header: "Notes", lo: true, truncate: true, cell: (e) => e.notes ?? "—" },
  ];
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Purchases"
        description="Things you buy that go into stock or become a machine. Their cost reaches profit when you print and sell."
        action={
          <Link href="/purchases/new" className={buttonClass("primary")}>
            <Icon name="plus" size={15} />
            Add purchase
          </Link>
        }
      />
      <StatStrip
        items={[
          {
            label: "Bought this month",
            value: usd(sum(now)),
            note: `${now.length} purchase${now.length === 1 ? "" : "s"}`,
          },
          { label: "Filament", value: usd(sum(of("filament"))) },
          { label: "Packaging", value: usd(sum(of("packaging"))) },
          { label: "Machines", value: usd(sum(of("machine"))) },
        ]}
      />
      <Pills current={cat} base="/purchases" options={PURCHASE_CATEGORIES.map((k) => [k, CATEGORY_LABELS[k]])} />
      {rows.length === 0 ? (
        <EmptyState title="No purchases yet">Filament, packaging and machines you buy show up here.</EmptyState>
      ) : (
        <Panel title="Purchases" titleId="purchases" count={rows.length} flush>
          <DataTable
            id="purchases"
            label="Purchases"
            wide
            columns={columns}
            rows={rows}
            rowKey={(e) => e.id}
            rowHref={(e) => `/expenses/${e.id}`}
            phoneRow={(e) => ({
              title: `${e.boughtName ?? CATEGORY_LABELS[e.category]}${e.brand ? ` · ${e.brand}` : ""}${e.purchaseQty ? ` · ${qty(e)}` : ""}`,
              subtitle: [e.spentOn, CATEGORY_LABELS[e.category], e.supplierName].filter(Boolean).join(" · "),
              trailing: <Money amount={e.amount} currency={e.currency} rateToUsd={e.rateToUsd} />,
              badge: e.editedAt ? <EditedMarker at={e.editedAt} /> : undefined,
            })}
          />
        </Panel>
      )}
    </div>
  );
}
