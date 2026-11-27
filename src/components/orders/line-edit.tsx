"use client";

import { useCallback } from "react";
import { InlineEdit, type InlineSave } from "@/components/ui";

type Save = (field: string, value: string) => ReturnType<InlineSave>;

/** One order line (prototype line-item): click-to-edit quantity, price each and note. */
export function LineEdit({
  save,
  name,
  quantity,
  price,
  priceShown,
  note,
  currency,
}: {
  save: Save;
  name: string;
  quantity: string;
  price: string;
  /** The price as money reads, e.g. "22.50". */
  priceShown: string;
  note: string;
  currency: "USD" | "LBP";
}) {
  const q = useCallback((v: string) => save("quantity", v), [save]);
  const p = useCallback((v: string) => save("unitPrice", v), [save]);
  const n = useCallback((v: string) => save("customization", v), [save]);
  return (
    <>
      <p className="font-medium">
        <InlineEdit label="quantity" value={quantity} save={q} inputMode="numeric" suffix=" ×" /> {name}
      </p>
      <p className="flex flex-wrap items-center gap-x-1 text-xs text-ink-muted">
        <InlineEdit
          label="price each"
          value={price}
          save={p}
          inputMode="decimal"
          display={priceShown}
          prefix={currency === "USD" ? "$" : undefined}
          suffix={currency === "LBP" ? " LBP each" : " each"}
        />
        <span aria-hidden="true">·</span>
        <InlineEdit label="line note" value={note} save={n} wide placeholder="Add a note" />
      </p>
    </>
  );
}
