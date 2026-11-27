"use client";

import { useState } from "react";
import { ActionForm } from "@/components/form/action-form";
import { NumberField, SelectField } from "@/components/form/fields";
import { Icon } from "@/components/shell/icons";
import { Button } from "@/components/ui";
import { addPartAction, removePartAction } from "@/server/assembly/actions";

type Part = { id: number; label: string; qtyPerProduct: number; onHand: number | null };

/** Product page "Parts list" (prototype): parts that go into one product, and + Add part. */
export function PartsPanel({
  productId,
  parts,
  partOptions,
}: {
  productId: number;
  parts: Part[];
  partOptions: { value: string; label: string }[];
}) {
  const [adding, setAdding] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      {parts.length ? (
        <ul aria-label="Parts list" className="-mx-4 -mt-1 divide-y divide-border border-b border-border">
          {parts.map((x) => (
            <li key={x.id} className="flex min-h-11 items-center gap-3 px-4">
              <span className="min-w-0 flex-1">
                <span className="font-medium tabular-nums">{x.qtyPerProduct} ×</span> {x.label}
                {x.onHand != null ? <span className="block text-sm text-ink-muted">{x.onHand} in stock</span> : null}
              </span>
              <form action={removePartAction.bind(null, productId, x.id)}>
                <Button type="submit" variant="quiet">
                  Remove
                </Button>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-ink-muted">
          Printed in one piece. Add parts only if you assemble it from separately printed pieces.
        </p>
      )}
      {adding ? (
        partOptions.length ? (
          <ActionForm
            action={addPartAction.bind(null, productId)}
            submitLabel="Add part"
            submitVariant="secondary"
            defaults={{ qtyPerProduct: "1" }}
          >
            <div className="grid grid-cols-3 gap-3 [&>*:first-child]:col-span-2">
              <SelectField name="partId" label="Part" placeholder="Choose…" options={partOptions} />
              <NumberField name="qtyPerProduct" label="Per product" />
            </div>
          </ActionForm>
        ) : (
          <p className="text-sm text-ink-muted">
            No parts yet. Add a product of type Part first, or import a recipe that prints one.
          </p>
        )
      ) : (
        <Button variant="ghost" className="self-start" onClick={() => setAdding(true)}>
          <Icon name="plus" size={15} />
          Add part
        </Button>
      )}
    </div>
  );
}
