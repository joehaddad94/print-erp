"use client";

import { useState } from "react";
import { NumberField, SelectField, TextField } from "@/components/form/fields";
import { Segmented } from "@/components/ui";

const TYPES = [
  { value: "product", label: "Product" },
  { value: "assembled", label: "Assembled product" },
  { value: "part", label: "Part" },
] as const;

/**
 * Add product form body (prototype /products/new). An assembled product is a product with a parts
 * list (filled in on its page next); a part is never sold, so it has no price and no packaging (D19, D31).
 */
export function ProductFields({ packaging }: { packaging: { value: string; label: string }[] }) {
  const [type, setType] = useState<string>("product");
  const sold = type !== "part";
  return (
    <>
      <Segmented name="type" legend="Type" options={TYPES} defaultValue="product" onChange={setType} />
      <input type="hidden" name="kind" value={sold ? "product" : "part"} />
      <input type="hidden" name="assembled" value={type === "assembled" ? "1" : ""} />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField name="name" label="Name" />
        <TextField name="variant" label="Variant" optional hint="Colour or size." />
      </div>
      {sold ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <NumberField name="salePriceUsd" label="Sale price" prefix="$" hint="Blank = can't be sold yet." />
          <SelectField name="packagingItemId" label="Packaging" placeholder="None" options={packaging} />
        </div>
      ) : null}
      {type === "assembled" ? (
        <p className="text-xs text-ink-muted">After saving, add the parts that go into one on its page.</p>
      ) : null}
    </>
  );
}
