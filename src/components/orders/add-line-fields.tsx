"use client";

import { useState } from "react";
import { NumberField, SelectField, TextField } from "@/components/form/fields";
import { formatMoney } from "@/lib/money";

type P = { id: number; label: string; salePriceUsd: number | null };

/** Price is pre-filled from the product (blank = product price) and may be changed, even to 0 (D45). */
export function AddLineFields({
  products,
  currency,
  rateToUsd,
}: {
  products: P[];
  currency: "USD" | "LBP";
  rateToUsd: number;
}) {
  const [productId, setProductId] = useState("");
  const p = products.find((x) => String(x.id) === productId);
  const price = p?.salePriceUsd == null ? null : p.salePriceUsd / rateToUsd;
  return (
    <>
      <SelectField
        name="productId"
        label="Product"
        placeholder="Choose…"
        options={products.map((x) => ({
          value: String(x.id),
          label: `${x.label}${x.salePriceUsd == null ? " (no price)" : ` · ${formatMoney(x.salePriceUsd, "USD")}`}`,
        }))}
        onValueChange={setProductId}
      />
      <div className="grid grid-cols-2 gap-3">
        <NumberField name="quantity" label="Quantity" />
        <NumberField
          name="unitPrice"
          label={`Price each (${currency})`}
          hint={
            price == null ? "Blank = the product's price." : `Blank = ${formatMoney(price, currency)}. 0 is allowed.`
          }
        />
      </div>
      <TextField name="customization" label="Customization" hint="Name, colour or text, if any." />
    </>
  );
}
