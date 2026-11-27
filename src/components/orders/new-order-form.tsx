"use client";

import { useState } from "react";
import { ActionForm, useFieldState } from "@/components/form/action-form";
import { CurrencyFields, DateField, SegmentedField, TextareaField } from "@/components/form/fields";
import { Icon } from "@/components/shell/icons";
import { Badge, Callout, Card, CostLine, CostTotal, Field, Input, Panel } from "@/components/ui";
import { AffixInput } from "@/components/ui/field";
import { Link } from "@/components/ui/link";
import { SearchPicker } from "@/components/ui/search-picker";
import { formatMoney } from "@/lib/money";
import { createOrderAction } from "@/server/orders/actions";

export type OrderProduct = {
  id: number;
  name: string;
  variant: string | null;
  priceUsd: number | null;
  costEachUsd: number | null;
  free: number;
};
export type OrderCustomer = { id: number; name: string; sub: string };

type Line = { productId: number; qty: string; price: string };

const num = (s: string | undefined) => {
  const n = Number((s ?? "").replace(/,/g, ""));
  return s?.trim() && Number.isFinite(n) ? n : NaN;
};
const label = (p: OrderProduct) => (p.variant ? `${p.name} · ${p.variant}` : p.name);

/**
 * New order (prototype /orders/new): customer (search, or "+ New customer"), channel, the items
 * with quantity and price, then status, due date and currency. The Order total panel follows
 * as you type and says what will be reserved and what still needs printing.
 */
export function NewOrderForm({
  customers,
  products,
  lbpRate,
  defaults,
}: {
  customers: OrderCustomer[];
  products: OrderProduct[];
  lbpRate?: string;
  defaults: Record<string, string>;
}) {
  const [vals, setVals] = useState<Record<string, string>>({
    currency: defaults.currency ?? "USD",
    status: defaults.status ?? "confirmed",
    lbpRate: defaults.lbpRate ?? "",
  });
  const [lines, setLines] = useState<Line[]>(() => {
    try {
      const parsed = JSON.parse(defaults.lines || "[]") as {
        productId: number;
        quantity: number;
        unitPrice: number | null;
      }[];
      return parsed.map((l) => ({
        productId: l.productId,
        qty: String(l.quantity),
        price: l.unitPrice == null ? "" : String(l.unitPrice),
      }));
    } catch {
      return [];
    }
  });
  const lbp = vals.currency === "LBP";
  const rate = lbp ? num(vals.lbpRate || lbpRate) : 1;
  const money = (n: number) => formatMoney(n, lbp ? "LBP" : "USD");
  const priceFor = (p: OrderProduct) =>
    p.priceUsd == null ? "" : String(lbp && rate > 0 ? Math.round(p.priceUsd * rate) : p.priceUsd);

  return (
    <ActionForm
      action={createOrderAction}
      defaults={defaults}
      submitLabel="Create order"
      cancelHref="/orders"
      onFieldInput={(n, v) => setVals((s) => ({ ...s, [n]: v }))}
      aside={
        <OrderTotal
          lines={lines}
          products={products}
          lbp={lbp}
          rate={rate}
          money={money}
          confirmed={vals.status === "confirmed"}
        />
      }
    >
      <CustomerCard customers={customers} />
      <ItemsCard lines={lines} setLines={setLines} products={products} money={money} priceFor={priceFor} lbp={lbp} />
      <Card className="flex flex-col gap-4">
        <h2 className="text-xs font-semibold tracking-wider text-ink-muted uppercase">Details</h2>
        <SegmentedField
          name="status"
          label="Status"
          options={[
            { value: "quoted", label: "Quoted" },
            { value: "confirmed", label: "Confirmed" },
          ]}
          hint="Quoted holds no stock. Confirmed reserves stock right away."
        />
        <CurrencyFields lbpRateDefault={lbpRate} beside={<DateField name="dueOn" label="Due" optional />} />
        <TextareaField name="notes" label="Notes" optional placeholder="Colour, engraving, delivery address…" />
      </Card>
    </ActionForm>
  );
}

function CustomerCard({ customers }: { customers: OrderCustomer[] }) {
  const saved = useFieldState("customerId");
  const savedNew = useFieldState("newCustomerName");
  const [customerId, setCustomerId] = useState<string | null>(saved.defaultValue || null);
  const [newName, setNewName] = useState<string | null>(savedNew.defaultValue || null);
  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-xs font-semibold tracking-wider text-ink-muted uppercase">Customer</h2>
      {newName != null ? (
        <Field
          id="new-customer-name"
          label="New customer name"
          hint="Their phone and address can be added on their page."
        >
          <div className="flex gap-2">
            <Input
              id="new-customer-name"
              name="newCustomerName"
              value={newName}
              autoFocus
              onChange={(e) => setNewName(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setNewName(null)}
              className="min-h-control shrink-0 cursor-pointer rounded-md px-2.5 text-sm font-medium text-action hover:bg-action-soft"
            >
              Pick instead
            </button>
          </div>
        </Field>
      ) : (
        <SearchPicker
          name="customerId"
          label="Customer"
          placeholder="Search name, phone or @handle"
          value={customerId}
          onChange={setCustomerId}
          error={saved.error}
          hint="Not in the list? Type the name and choose “+ New customer”."
          items={customers.map((c) => ({ id: String(c.id), label: c.name, sub: c.sub || undefined, keywords: c.sub }))}
          empty="No customer matches."
          createLabel="New customer"
          onCreate={(q) => {
            setCustomerId(null);
            setNewName(q);
          }}
        />
      )}
      <SegmentedField
        name="channel"
        label="Channel"
        options={[
          { value: "whatsapp", label: "WhatsApp" },
          { value: "instagram", label: "Instagram" },
          { value: "in_person", label: "In person" },
        ]}
      />
    </Card>
  );
}

/** The items: one row per product with quantity, price and line total; the list is sent as JSON. */
function ItemsCard({
  lines,
  setLines,
  products,
  money,
  priceFor,
  lbp,
}: {
  lines: Line[];
  setLines: React.Dispatch<React.SetStateAction<Line[]>>;
  products: OrderProduct[];
  money: (n: number) => string;
  priceFor: (p: OrderProduct) => string;
  lbp: boolean;
}) {
  const [noPrice, setNoPrice] = useState<OrderProduct | null>(null);
  const [pickerKey, setPickerKey] = useState(0);
  const set = (i: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const json = JSON.stringify(
    lines.map((l) => ({
      productId: l.productId,
      quantity: Number.isFinite(num(l.qty)) ? num(l.qty) : null,
      unitPrice: Number.isFinite(num(l.price)) ? num(l.price) : null,
    })),
  );
  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-xs font-semibold tracking-wider text-ink-muted uppercase">Items</h2>
      <input type="hidden" name="lines" value={json} />
      {lines.length ? (
        <ul aria-label="Items" className="flex flex-col gap-2">
          {lines.map((l, i) => {
            const p = products.find((x) => x.id === l.productId)!;
            const q = num(l.qty);
            const fromStock = Math.min(Number.isFinite(q) ? q : 0, Math.max(0, Math.floor(p.free)));
            const toPrint = Math.max(0, (Number.isFinite(q) ? q : 0) - fromStock);
            const total = q * num(l.price);
            return (
              <li
                key={`${l.productId}-${i}`}
                className="flex flex-wrap items-center gap-3 rounded-md border border-border p-3"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-md bg-surface-muted text-ink-muted">
                  <Icon name="products" size={16} />
                </span>
                <span className="min-w-0 flex-1 basis-40">
                  <span className="block truncate font-medium">
                    {p.name}
                    {p.variant ? <span className="font-normal text-ink-muted"> {p.variant}</span> : null}
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
                    {toPrint > 0 ? (
                      <Badge tone="danger">Need to print {toPrint}</Badge>
                    ) : (
                      <Badge tone="success">All from stock</Badge>
                    )}
                    {toPrint > 0 && fromStock > 0 ? `${fromStock} from stock` : null}
                  </span>
                </span>
                <span className="flex w-full items-center gap-2 sm:w-auto">
                  <span className="w-20 shrink-0">
                    <AffixInput
                      id={`line-${i}-qty`}
                      aria-label={`Quantity of ${label(p)}`}
                      inputMode="numeric"
                      suffix="×"
                      value={l.qty}
                      onChange={(e) => set(i, { qty: e.target.value })}
                    />
                  </span>
                  <span className="min-w-0 flex-1 sm:w-28 sm:flex-none">
                    <AffixInput
                      id={`line-${i}-price`}
                      aria-label={`Price each of ${label(p)}`}
                      inputMode="decimal"
                      prefix={lbp ? "LBP" : "$"}
                      value={l.price}
                      onChange={(e) => set(i, { price: e.target.value })}
                    />
                  </span>
                  <span className="w-16 shrink-0 text-right font-medium tabular-nums">
                    {Number.isFinite(total) ? money(total) : "—"}
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove ${label(p)}`}
                    onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
                    className="grid size-control cursor-pointer place-items-center rounded-md text-ink-muted hover:bg-surface-muted hover:text-danger"
                  >
                    <Icon name="close" size={16} />
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
      {noPrice ? (
        <Callout tone="warning" title={`Set a sale price for ${label(noPrice)} first.`}>
          <Link
            className="inline-flex min-h-control items-center font-semibold underline"
            href={`/products/${noPrice.id}`}
          >
            Fix it
          </Link>
        </Callout>
      ) : null}
      <SearchPicker
        key={pickerKey}
        name="_addItem"
        label="Add an item"
        placeholder="Search products"
        value={null}
        onChange={(id) => {
          const p = products.find((x) => String(x.id) === id);
          if (!p) return;
          if (p.priceUsd == null) {
            setNoPrice(p);
            return;
          }
          setNoPrice(null);
          setLines((ls) => [...ls, { productId: p.id, qty: "1", price: priceFor(p) }]);
          setPickerKey((k) => k + 1);
        }}
        hint="Price comes from the product. You can change it for this order."
        items={products.map((p) => ({
          id: String(p.id),
          label: label(p),
          sub: [
            p.priceUsd == null ? "no price yet" : formatMoney(p.priceUsd, "USD"),
            `${Math.max(0, Math.floor(p.free))} free`,
          ].join(" · "),
        }))}
        empty="No product matches."
      />
    </Card>
  );
}

function OrderTotal({
  lines: draft,
  products,
  lbp,
  rate,
  money,
  confirmed,
}: {
  lines: Line[];
  products: OrderProduct[];
  lbp: boolean;
  rate: number;
  money: (n: number) => string;
  confirmed: boolean;
}) {
  const lines = draft.map((l) => ({
    productId: l.productId,
    quantity: Number.isFinite(num(l.qty)) ? num(l.qty) : 0,
    unitPrice: Number.isFinite(num(l.price)) ? num(l.price) : 0,
  }));
  const rows = lines.map((l) => {
    const p = products.find((x) => x.id === l.productId);
    const q = l.quantity ?? 0;
    const lineTotal = q * (l.unitPrice ?? 0);
    const usdEach = (l.unitPrice ?? 0) / (lbp ? rate : 1);
    const fromStock = Math.min(q, Math.max(0, Math.floor(p?.free ?? 0)));
    return {
      key: l.productId,
      text: `${q} × ${p ? label(p) : "?"}`,
      lineTotal,
      profit: p?.costEachUsd != null ? q * (usdEach - p.costEachUsd) : 0,
      costKnown: p?.costEachUsd != null,
      fromStock,
      toPrint: q - fromStock,
    };
  });
  const sum = (k: "lineTotal" | "profit" | "fromStock" | "toPrint") => rows.reduce((n, r) => n + r[k], 0);
  const total = sum("lineTotal");
  const profit = sum("profit");
  const reserved = sum("fromStock");
  const toPrint = sum("toPrint");
  return (
    <Panel title="Order total" titleId="order-total">
      {rows.length ? (
        <dl className="flex flex-col">
          {rows.map((r, i) => (
            <CostLine key={`${r.key}-${i}`} label={r.text} value={money(r.lineTotal)} />
          ))}
          <CostTotal label="Total" value={money(total)} />
          <CostLine label="Profit (est.)" value={rows.some((r) => r.costKnown) ? formatMoney(profit, "USD") : "—"} />
        </dl>
      ) : (
        <p className="text-sm text-ink-muted">Add an item to see the total.</p>
      )}
      {rows.length ? (
        <p className="pt-2 text-xs text-ink-muted">
          {confirmed
            ? `When you create it: ${reserved} ${reserved === 1 ? "piece" : "pieces"} reserved from stock, ${toPrint} to print.`
            : "Quoted: nothing is reserved until you confirm."}
        </p>
      ) : null}
    </Panel>
  );
}
