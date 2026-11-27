"use client";

import { useState } from "react";
import { ActionForm } from "@/components/form/action-form";
import { DateField, NumberField } from "@/components/form/fields";
import { Badge, Callout, Card, DataTable, KeyValues, Panel } from "@/components/ui";
import { SearchPicker } from "@/components/ui/search-picker";
import { formatMoney } from "@/lib/money";
import { assembleAction } from "@/server/assembly/actions";

type Part = { id: number; name: string; qtyPerProduct: number; onHand: number; avgCostUsd: number | null };
export type AssembleProduct = { id: number; label: string; onHand: number; parts: Part[] };

const usd = (n: number) => formatMoney(n, "USD");
const qty = (n: number) => String(Number(n.toFixed(3)));

/**
 * Assemble (prototype /assemble, D19, D36): pick a product with a parts list, say how many you made;
 * the parts needed, what is short, and the cost show as you type. Short parts warn but never block.
 */
export function AssembleForm({
  products,
  today,
  initialId,
}: {
  products: AssembleProduct[];
  today: string;
  initialId?: string;
}) {
  const [productId, setProductId] = useState<string | null>(
    initialId ?? (products.length === 1 ? String(products[0]!.id) : null),
  );
  const [count, setCount] = useState("1");
  const p = products.find((x) => String(x.id) === productId);
  const n = Math.max(0, Math.round(Number(count) || 0));
  const rows = (p?.parts ?? []).map((x) => ({
    ...x,
    needed: x.qtyPerProduct * n,
    short: Math.max(0, x.qtyPerProduct * n - x.onHand),
  }));
  const short = rows.filter((x) => x.short > 0);
  const costKnown = rows.length > 0 && rows.every((x) => x.avgCostUsd != null);
  const costEach = costKnown ? rows.reduce((s, x) => s + x.qtyPerProduct * x.avgCostUsd!, 0) : null;

  return (
    <div className="grid items-start gap-5 lg:grid-aside">
      <ActionForm
        action={assembleAction}
        submitLabel="Save assembly"
        cancelHref="/products"
        defaults={{ assembledOn: today, qty: "1" }}
        className="flex min-w-0 flex-col gap-5"
      >
        <Card className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <SearchPicker
              name="productId"
              label="Product"
              placeholder="Search products with a parts list"
              value={productId ?? ""}
              onChange={setProductId}
              items={products.map((x) => ({
                id: String(x.id),
                label: x.label,
                sub: `Assembled · ${x.parts.map((y) => `${qty(y.qtyPerProduct)} ${y.name}`).join(" + ")} · ${x.onHand} in stock`,
              }))}
            />
            <p className="text-xs text-ink-muted">Only products with a parts list appear here.</p>
          </div>
          <div
            className="grid gap-3 sm:grid-cols-2"
            onChange={(e) => {
              const t = e.target as HTMLInputElement;
              if (t.name === "qty") setCount(t.value);
            }}
          >
            <NumberField name="qty" label="How many made" />
            <DateField name="assembledOn" label="Date" />
          </div>
          <NumberField
            name="assemblyMinutesPerUnit"
            label="Your minutes each"
            suffix="min"
            optional
            hint="Used for profit per hour, not for cost."
          />
        </Card>
        {p ? (
          <Panel title="Parts used" titleId="parts-used" count={rows.length} flush>
            <DataTable
              id="parts-used-table"
              label="Parts needed"
              rows={rows}
              rowKey={(x) => x.id}
              columns={[
                { key: "part", header: "Part", cell: (x) => x.name },
                { key: "needed", header: "Needed", numeric: true, cell: (x) => qty(x.needed) },
                { key: "stock", header: "In stock", numeric: true, cell: (x) => qty(x.onHand) },
                {
                  key: "cost",
                  header: "Cost each",
                  numeric: true,
                  cell: (x) => (x.avgCostUsd == null ? "—" : usd(x.avgCostUsd)),
                },
                {
                  key: "state",
                  header: "",
                  cell: (x) =>
                    x.short > 0 ? (
                      <Badge tone="warning">Short {qty(x.short)}</Badge>
                    ) : (
                      <Badge tone="success">Enough</Badge>
                    ),
                },
              ]}
              phoneRow={(x) => ({
                title: x.name,
                subtitle: `need ${qty(x.needed)} · have ${qty(x.onHand)}`,
                trailing:
                  x.short > 0 ? (
                    <Badge tone="warning">Short {qty(x.short)}</Badge>
                  ) : (
                    <Badge tone="success">Enough</Badge>
                  ),
              })}
            />
          </Panel>
        ) : null}
        {short.length ? (
          <Callout
            tone="warning"
            title={`${short.map((x) => x.name).join(", ")} ${short.length === 1 ? "is" : "are"} short.`}
          >
            You can still save. {short.length === 1 ? `${short[0]!.name} stock goes` : "Their stock goes"} below zero
            and shows red until you print more or count it.
          </Callout>
        ) : null}
      </ActionForm>
      <div className="hidden lg:sticky lg:top-4 lg:block">
        <Panel title="Result" titleId="assemble-result">
          {p && n > 0 ? (
            <>
              <KeyValues
                items={[
                  ["Adds to stock", `${n} ${p.label}`],
                  ["Parts cost each", costEach != null ? usd(costEach) : "—"],
                  ["Takes from stock", rows.map((x) => `${qty(x.needed)} ${x.name}`).join(", ")],
                ]}
              />
              <p className="pt-2 text-xs text-ink-muted">
                Each one costs what its parts cost. Packaging is added when it sells.
              </p>
            </>
          ) : (
            <p className="text-sm text-ink-muted">Pick a product and how many you made.</p>
          )}
        </Panel>
      </div>
    </div>
  );
}
