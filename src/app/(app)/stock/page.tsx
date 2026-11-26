import { Icon } from "@/components/shell/icons";
import { Badge, Callout, DataTable, EmptyState, PageHeader, Panel, buttonClass, type Column } from "@/components/ui";
import { Link } from "@/components/ui/link";
import { db } from "@/db";
import { LOW_FILAMENT_G } from "@/lib/filament";
import { formatMoney } from "@/lib/money";
import { stockList } from "@/server/assembly/service";
import { isOwner, requireUser } from "@/server/auth/session";

type Row = Awaited<ReturnType<typeof stockList>>[number];

const GROUPS = [
  ["finished_product", "Products"],
  ["printed_part", "Parts"],
  ["filament", "Filament"],
  ["consumable", "Packaging and consumables"],
] as const;

const fmt = (n: number, unit: string) =>
  `${Number(n.toFixed(unit === "grams" ? 1 : 0)).toLocaleString("en-US")} ${unit === "grams" ? "g" : "pcs"}`;
const price = (s: Row) =>
  s.avgCostUsd == null
    ? "—"
    : `${formatMoney(s.avgCostUsd * (s.unit === "grams" ? 1000 : 1), "USD")}${s.unit === "grams" ? "/kg" : " each"}`;
const low = (s: Row) => s.type === "filament" && s.onHand < LOW_FILAMENT_G;

/** R6 Stock: one panel per kind, what's free after reservations, and the value at average cost. */
export default async function StockPage({ searchParams }: PageProps<"/stock">) {
  const me = await requireUser();
  const adjusted = (await searchParams).adjusted;
  const rows = await stockList(db());
  const columns: Column<Row>[] = [
    {
      key: "name",
      header: "Item",
      cell: (s) => (
        <span className="flex items-center gap-2 font-medium">
          {s.name}
          {low(s) ? <Badge tone="warning">Low</Badge> : null}
        </span>
      ),
    },
    {
      key: "onHand",
      header: "In stock",
      numeric: true,
      cell: (s) => <span className={s.onHand < 0 ? "font-semibold text-danger" : ""}>{fmt(s.onHand, s.unit)}</span>,
    },
    {
      key: "reserved",
      header: "Reserved",
      numeric: true,
      lo: true,
      cell: (s) => (s.reserved ? fmt(s.reserved, s.unit) : "—"),
    },
    { key: "free", header: "Free", numeric: true, cell: (s) => fmt(s.available, s.unit) },
    { key: "price", header: "Average cost", numeric: true, cell: price },
    {
      key: "value",
      header: "Value",
      numeric: true,
      lo: true,
      cell: (s) => (s.valueUsd == null ? "—" : formatMoney(s.valueUsd, "USD")),
    },
  ];
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Stock"
        description="Purchases and finished prints add stock. Sales take it out."
        action={
          <div className="flex flex-wrap gap-2">
            {isOwner(me) ? (
              <Link href="/stock/adjust" className={buttonClass("secondary")}>
                <Icon name="edit" size={15} />
                Adjust stock
              </Link>
            ) : null}
            <Link href="/expenses/new" className={buttonClass("primary")}>
              <Icon name="plus" size={15} />
              Buy
            </Link>
          </div>
        }
      />
      {typeof adjusted === "string" ? <Callout tone="success">{adjusted}</Callout> : null}
      {rows.length === 0 ? (
        <EmptyState title="Nothing in stock yet">Purchases and finished prints add stock.</EmptyState>
      ) : null}
      {GROUPS.map(([type, title]) => {
        const items = rows.filter((r) => r.type === type);
        if (!items.length) return null;
        return (
          <Panel key={type} title={title} titleId={`stock-${type}`} count={items.length} flush>
            <DataTable
              id={`stock-${type}`}
              label={title}
              columns={columns}
              rows={items}
              rowKey={(s) => s.id}
              phoneRow={(s) => ({
                title: s.name,
                subtitle: [
                  price(s),
                  s.reserved > 0 ? `${s.reserved} reserved · ${fmt(s.available, s.unit)} free` : null,
                ]
                  .filter(Boolean)
                  .join(" · "),
                trailing: (
                  <span className="flex items-center gap-2">
                    {low(s) ? <Badge tone="warning">Low</Badge> : null}
                    <span className={s.onHand < 0 ? "font-bold text-danger tabular-nums" : "font-bold tabular-nums"}>
                      {fmt(s.onHand, s.unit)}
                    </span>
                  </span>
                ),
              })}
            />
          </Panel>
        );
      })}
    </div>
  );
}
