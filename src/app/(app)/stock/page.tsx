import { Pills } from "@/components/money/pills";
import { Icon } from "@/components/shell/icons";
import { Badge, Callout, DataTable, EmptyState, PageHeader, Panel, buttonClass, type Column } from "@/components/ui";
import { Link } from "@/components/ui/link";
import { db } from "@/db";
import { isLow, swatch } from "@/lib/filament";
import { formatMoney } from "@/lib/money";
import { stockList } from "@/server/assembly/service";
import { isOwner, requireUser } from "@/server/auth/session";
import { appDefaults } from "@/server/settings/service";

type Row = Awaited<ReturnType<typeof stockList>>[number];

const GROUPS = [
  { type: "finished_product", key: "products", title: "Products", item: "Product" },
  { type: "printed_part", key: "parts", title: "Parts", item: "Part" },
  { type: "filament", key: "filament", title: "Filament", item: "Filament" },
  { type: "consumable", key: "packaging", title: "Packaging", item: "Item" },
] as const;

const usd = (n: number) => formatMoney(n, "USD");
const fmt = (n: number, unit: string) =>
  `${Number(n.toFixed(unit === "grams" ? 1 : 0)).toLocaleString("en-US")} ${unit === "grams" ? "g" : "pcs"}`;
const avg = (s: Row) =>
  s.avgCostUsd == null ? "—" : s.unit === "grams" ? `${usd(s.avgCostUsd * 1000)}/kg` : `${usd(s.avgCostUsd)} each`;
const value = (s: Row) => (s.valueUsd == null ? "—" : usd(s.valueUsd));

function Swatch({ color }: { color: string | null }) {
  const c = swatch(color);
  return (
    <span
      aria-hidden="true"
      className="inline-block size-3 shrink-0 rounded-full border border-border-strong"
      style={c ? { background: c } : undefined}
    />
  );
}

/** Stock (prototype /stock): one panel per kind with filter pills; what's free after reservations. */
export default async function StockPage({ searchParams }: PageProps<"/stock">) {
  const me = await requireUser();
  const sp = await searchParams;
  const adjusted = sp.adjusted;
  const [rows, defs] = await Promise.all([stockList(db()), appDefaults(db())]);
  const low = (s: Row) => isLow(s, defs.lowFilamentG);
  const picked = GROUPS.find((g) => g.key === sp.show)?.key;

  const name = (s: Row) => (
    <span className="flex items-center gap-2">
      {s.type === "filament" ? <Swatch color={s.color} /> : null}
      <span className="font-medium">{s.name}</span>
    </span>
  );
  const pieceColumns = (item: string): Column<Row>[] => [
    { key: "name", header: item, cell: name },
    {
      key: "onHand",
      header: "In stock",
      numeric: true,
      cell: (s) => <span className={s.onHand < 0 ? "font-semibold text-danger" : ""}>{fmt(s.onHand, s.unit)}</span>,
    },
    { key: "reserved", header: "Reserved", numeric: true, lo: true, cell: (s) => fmt(s.reserved, s.unit) },
    { key: "free", header: "Free", numeric: true, cell: (s) => fmt(s.available, s.unit) },
    { key: "cost", header: "Cost each", numeric: true, cell: (s) => (s.avgCostUsd == null ? "—" : usd(s.avgCostUsd)) },
    { key: "value", header: "Value", numeric: true, lo: true, cell: value },
  ];
  const supplyColumns = (item: string): Column<Row>[] => [
    { key: "name", header: item, cell: name },
    {
      key: "left",
      header: "Left",
      numeric: true,
      cell: (s) => <span className={s.onHand < 0 ? "font-semibold text-danger" : ""}>{fmt(s.onHand, s.unit)}</span>,
    },
    { key: "low", header: "", cell: (s) => (low(s) ? <Badge tone="warning">Low</Badge> : null) },
    { key: "avg", header: "Avg price", numeric: true, cell: avg },
    { key: "value", header: "Value", numeric: true, cell: value },
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
            <Link href="/stock/new" className={buttonClass("secondary")}>
              <Icon name="plus" size={15} />
              New stock item
            </Link>
            <Link href="/purchases/new" className={buttonClass("primary")}>
              <Icon name="plus" size={15} />
              Buy
            </Link>
          </div>
        }
      />
      {typeof adjusted === "string" ? <Callout tone="success">{adjusted}</Callout> : null}
      {rows.length === 0 ? (
        <EmptyState title="Nothing in stock yet">Purchases and finished prints add stock.</EmptyState>
      ) : (
        <Pills
          current={picked}
          base="/stock"
          param="show"
          all={false}
          options={GROUPS.map((g) => [g.key, g.title, rows.filter((r) => r.type === g.type).length] as const)}
        />
      )}
      {GROUPS.filter((g) => !picked || g.key === picked).map((g) => {
        const items = rows.filter((r) => r.type === g.type);
        if (!items.length) return null;
        const pieces = g.type === "finished_product" || g.type === "printed_part";
        return (
          <Panel key={g.type} title={g.title} titleId={`stock-${g.key}`} count={items.length} flush>
            <DataTable
              id={`stock-${g.key}`}
              label={g.title}
              columns={pieces ? pieceColumns(g.item) : supplyColumns(g.item)}
              rows={items}
              rowKey={(s) => s.id}
              rowHref={pieces ? (s) => `/products/${s.productId}` : undefined}
              phoneRow={(s) => ({
                title: (
                  <span className="flex items-center gap-2">
                    {s.type === "filament" ? <Swatch color={s.color} /> : null}
                    {s.name}
                  </span>
                ),
                subtitle: pieces ? (s.avgCostUsd == null ? undefined : `${usd(s.avgCostUsd)} each`) : avg(s),
                trailing: (
                  <span className="flex flex-col items-end">
                    <span
                      className={s.onHand < 0 ? "font-semibold text-danger tabular-nums" : "font-semibold tabular-nums"}
                    >
                      {fmt(s.onHand, s.unit)}
                    </span>
                    {pieces ? (
                      <span className="text-xs text-ink-muted">
                        {s.reserved > 0 ? `${fmt(s.reserved, s.unit)} reserved` : "free"}
                      </span>
                    ) : low(s) ? (
                      <Badge tone="warning">Low</Badge>
                    ) : null}
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
