"use client";

import { useState } from "react";
import { ActionForm } from "@/components/form/action-form";
import { DateField, NumberField, SelectField, TextareaField } from "@/components/form/fields";
import { Callout } from "@/components/ui";
import { assembleAction } from "@/server/assembly/actions";

type Product = { id: number; label: string; parts: { name: string; qtyPerProduct: number; onHand: number }[] };

/** Assemble (D19, D36): shows the parts needed; short parts warn but never block the save. */
export function AssembleForm({ products, today }: { products: Product[]; today: string }) {
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState("1");
  const p = products.find((x) => String(x.id) === productId);
  const n = Math.max(0, Math.round(Number(qty) || 0));
  const short = p?.parts.filter((x) => x.qtyPerProduct * n > x.onHand) ?? [];
  return (
    <ActionForm action={assembleAction} submitLabel="Save assembly" defaults={{ assembledOn: today, qty: "1" }}>
      <SelectField
        name="productId"
        label="Product"
        placeholder="Choose…"
        options={products.map((x) => ({ value: String(x.id), label: x.label }))}
        onValueChange={setProductId}
      />
      <div
        className="grid grid-cols-2 gap-3"
        onChange={(e) => (e.target as HTMLInputElement).name === "qty" && setQty((e.target as HTMLInputElement).value)}
      >
        <NumberField name="qty" label="How many made" />
        <DateField name="assembledOn" label="Date" />
      </div>
      <NumberField
        name="assemblyMinutesPerUnit"
        label="Assembly minutes each"
        suffix="min"
        hint="Optional. Counts in profit per hour."
      />
      {p ? (
        <ul className="divide-y divide-border rounded-md border border-border text-sm" aria-label="Parts needed">
          {p.parts.map((x) => (
            <li key={x.name} className="flex justify-between gap-3 px-3 py-2">
              <span>{x.name}</span>
              <span className={x.qtyPerProduct * n > x.onHand ? "font-bold text-danger" : "tabular-nums"}>
                {x.qtyPerProduct * n} needed · {x.onHand} on hand
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {short.length ? (
        <Callout tone="warning" title="Not enough parts in stock">
          {short.map((x) => x.name).join(", ")} will go below zero. You can still save; fix the count later.
        </Callout>
      ) : null}
      <TextareaField name="notes" label="Notes" />
    </ActionForm>
  );
}
