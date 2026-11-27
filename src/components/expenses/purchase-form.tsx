"use client";

import { useState } from "react";
import { ActionForm } from "@/components/form/action-form";
import {
  CurrencyFields,
  DateField,
  NumberField,
  SegmentedField,
  SelectField,
  TextField,
  TextareaField,
} from "@/components/form/fields";
import { Icon } from "@/components/shell/icons";
import { Button, Card, KeyValues, Panel } from "@/components/ui";
import { Link } from "@/components/ui/link";
import { SearchPicker } from "@/components/ui/search-picker";
import { formatMoney } from "@/lib/money";
import type { FormState } from "@/server/form";
import { PAID_WITH } from "./paid-with";
import { SupplierPicker } from "./supplier-picker";

export type StockOption = {
  id: number;
  name: string;
  type: string;
  onHand: number;
  avgCostUsd: number | null;
};

const usd = (n: number) => formatMoney(n, "USD");
const num = (s: string | undefined) => {
  const n = Number((s ?? "").replace(/,/g, ""));
  return s?.trim() && Number.isFinite(n) ? n : NaN;
};
const qtyText = (n: number, filament: boolean) => `${Math.round(n).toLocaleString("en-US")} ${filament ? "g" : "pcs"}`;

/**
 * Add purchase (prototype /purchases/new): what you bought is a stock item, picked from a search
 * with "+ New stock item" at the bottom; then the payment. The right panel shows what the save
 * does to stock and to the average price (D23). Machines are bought from Machines, not here.
 */
export function PurchaseForm({
  action,
  defaults,
  stock,
  suppliers,
  brands,
  lbpRate,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  defaults: Record<string, string>;
  stock: StockOption[];
  suppliers: { value: string; label: string }[];
  brands: string[];
  lbpRate?: string;
}) {
  const preset = defaults.filamentId || defaults.packagingId || "";
  const [itemId, setItemId] = useState<string | null>(preset || null);
  const [creating, setCreating] = useState(false);
  const [newType, setNewType] = useState(defaults.category === "packaging" ? "packaging" : "filament");
  const [vals, setVals] = useState<Record<string, string>>({ currency: defaults.currency ?? "USD" });

  const item = stock.find((s) => String(s.id) === itemId);
  const filament = creating ? newType === "filament" : item ? item.type === "filament" : true;
  const category = creating ? newType : item ? (item.type === "filament" ? "filament" : "packaging") : "";
  const qty = num(filament ? vals.grams : vals.pieces);
  const amount = num(vals.amount);
  const rate = vals.currency === "LBP" ? num(vals.lbpRate || lbpRate) : 1;
  const totalUsd = vals.currency === "LBP" ? amount / rate : amount;
  const unitUsd = qty > 0 && totalUsd > 0 ? totalUsd / qty : NaN;
  const name = creating
    ? newType === "filament"
      ? [vals.newMaterial, vals.newColor].filter(Boolean).join(" ") || "New filament"
      : vals.newPackagingName || "New item"
    : (item?.name ?? "");
  const onHand = creating ? 0 : (item?.onHand ?? 0);
  const avgBefore = creating ? null : (item?.avgCostUsd ?? null);
  const avgAfter =
    Number.isFinite(unitUsd) && qty > 0
      ? onHand > 0 && avgBefore != null
        ? (onHand * avgBefore + totalUsd) / (onHand + qty)
        : unitUsd
      : NaN;
  const per = (u: number) => (filament ? `${usd(u * 1000)}/kg` : `${usd(u)} each`);

  return (
    <ActionForm
      action={action}
      defaults={defaults}
      submitLabel="Save purchase"
      cancelHref="/purchases"
      onFieldInput={(n, v) => setVals((s) => ({ ...s, [n]: v }))}
      aside={
        <Panel title="What this does" titleId="purchase-effect">
          {name && (qty > 0 || Number.isFinite(unitUsd)) ? (
            <KeyValues
              items={[
                ["Adds to stock", qty > 0 ? `${qtyText(qty, filament)} ${name}` : name],
                [filament ? "Price per kg" : "Price each", Number.isFinite(unitUsd) ? per(unitUsd) : "—"],
                ["Average after", Number.isFinite(avgAfter) ? per(avgAfter) : "—"],
                ["Stock after", qty > 0 ? qtyText(onHand + qty, filament) : qtyText(onHand, filament)],
              ]}
            />
          ) : (
            <p className="text-sm text-ink-muted">Pick what you bought and type the quantity and total paid.</p>
          )}
          <p className="pt-2 text-xs text-ink-muted">
            Prints use the average price per gram. This purchase is not a running expense.
          </p>
        </Panel>
      }
    >
      <input type="hidden" name="category" value={category} />
      <Card className="flex flex-col gap-4">
        {creating ? (
          <>
            <SegmentedField
              name="newType"
              label="New stock item"
              options={[
                { value: "filament", label: "Filament" },
                { value: "packaging", label: "Packaging" },
              ]}
              onValueChange={setNewType}
            />
            {newType === "filament" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField name="newMaterial" label="Material" placeholder="PLA" />
                <TextField name="newColor" label="Colour" placeholder="Black" />
                <NumberField name="emptySpoolWeightG" label="Empty spool" optional suffix="g" hint="For weigh-ins." />
              </div>
            ) : (
              <TextField name="newPackagingName" label="New item name" placeholder="Small box" />
            )}
            <Button variant="quiet" className="self-start" onClick={() => setCreating(false)}>
              Pick from the list instead
            </Button>
          </>
        ) : (
          <SearchPicker
            name={filament ? "filamentId" : "packagingId"}
            label="What did you buy?"
            placeholder="Search filament, packaging or other stock"
            value={itemId}
            onChange={setItemId}
            hint="Pick an existing stock item. Not in the list? Choose “+ New stock item” at the bottom."
            items={stock.map((s) => ({
              id: String(s.id),
              label: s.name,
              group: s.type === "filament" ? "Filament" : "Packaging",
              sub: [
                qtyText(s.onHand, s.type === "filament"),
                s.avgCostUsd != null
                  ? s.type === "filament"
                    ? `${usd(s.avgCostUsd * 1000)}/kg`
                    : `${usd(s.avgCostUsd)} each`
                  : null,
              ]
                .filter(Boolean)
                .join(" · "),
            }))}
            empty="Nothing matches."
            createLabel="New stock item"
            onCreate={() => {
              setItemId(null);
              setCreating(true);
            }}
          />
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {filament ? (
            <NumberField name="grams" label="Quantity" suffix="g" hint="A 1 kg spool is 1000 g." />
          ) : (
            <NumberField name="pieces" label="Quantity" suffix="pcs" />
          )}
          {filament ? (
            <>
              <TextField
                name="brand"
                label="Brand"
                optional
                placeholder="eSun"
                list="filament-brands"
                autoComplete="off"
              />
              <datalist id="filament-brands">
                {brands.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </>
          ) : null}
        </div>
        <details className="group">
          <summary className="flex min-h-control cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-action">
            <Icon name="chevron" size={14} className="transition-transform group-open:rotate-90" />
            Bought a new printer instead?
          </summary>
          <p className="pt-1 text-sm text-ink-muted">
            Machines are not stock.{" "}
            <Link
              href="/machines/new"
              className="inline-flex min-h-tap items-center font-medium text-action underline lg:min-h-6"
            >
              Add it under Machines
            </Link>{" "}
            with its price, and the purchase is recorded there.
          </p>
        </details>
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-xs font-semibold tracking-wider text-ink-muted uppercase">Payment</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <NumberField name="amount" label="Total paid" />
          <DateField name="spentOn" label="Date" />
        </div>
        <CurrencyFields lbpRateDefault={lbpRate} />
        <div className="grid items-start gap-3 sm:grid-cols-2">
          <SelectField name="paymentMethod" label="Paid with" options={PAID_WITH} />
          <SupplierPicker suppliers={suppliers} />
        </div>
        <TextareaField name="notes" label="Notes" optional placeholder="Anything to remember" />
      </Card>
    </ActionForm>
  );
}
