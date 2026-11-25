import { EmptyState, List, ListRow, PageHeader } from "@/components/ui";
import { db } from "@/db";
import { formatMoney } from "@/lib/money";
import { stockList } from "@/server/assembly/service";
import { requireUser } from "@/server/auth/session";

const GROUPS = [
  ["finished_product", "Products"],
  ["printed_part", "Parts"],
  ["filament", "Filament"],
  ["consumable", "Packaging and consumables"],
] as const;

const fmt = (n: number, unit: string) =>
  `${Number(n.toFixed(unit === "grams" ? 1 : 0)).toLocaleString("en-US")} ${unit === "grams" ? "g" : "pcs"}`;

export default async function StockPage() {
  await requireUser();
  const rows = await stockList(db());
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Stock" />
      {rows.length === 0 ? (
        <EmptyState title="Nothing in stock yet">Purchases and finished prints add stock.</EmptyState>
      ) : null}
      {GROUPS.map(([type, title]) => {
        const items = rows.filter((r) => r.type === type);
        if (!items.length) return null;
        return (
          <section key={type} aria-labelledby={`stock-${type}`} className="flex flex-col gap-2">
            <h2 id={`stock-${type}`} className="text-lg font-bold">
              {title}
            </h2>
            <List label={title}>
              {items.map((s) => (
                <ListRow
                  key={s.id}
                  title={s.name}
                  subtitle={[
                    s.avgCostUsd != null
                      ? `${formatMoney(s.avgCostUsd * (s.unit === "grams" ? 1000 : 1), "USD")} ${s.unit === "grams" ? "per kg" : "each"}`
                      : null,
                    s.reserved > 0 ? `${s.reserved} reserved · ${s.available} available` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  trailing={
                    <span className={s.onHand < 0 ? "font-bold text-danger tabular-nums" : "font-bold tabular-nums"}>
                      {fmt(s.onHand, s.unit)}
                    </span>
                  }
                />
              ))}
            </List>
          </section>
        );
      })}
    </div>
  );
}
