"use client";

import { useState } from "react";
import { useFieldState } from "@/components/form/action-form";
import { NumberField, SelectField, TextField } from "@/components/form/fields";

/** Product form body. Price and packaging only show for things that are sold (D19, D31). */
export function ProductFields({ packaging }: { packaging: { value: string; label: string }[] }) {
  const { defaultValue } = useFieldState("kind");
  const [kind, setKind] = useState(defaultValue || "product");
  return (
    <>
      <TextField name="name" label="Name" />
      <TextField name="variant" label="Variant" hint="Colour or size, if you sell more than one." />
      <SelectField
        name="kind"
        label="Type"
        options={[
          { value: "product", label: "Product (sold)" },
          { value: "part", label: "Part (assembled into a product)" },
        ]}
        onValueChange={setKind}
      />
      {kind === "product" ? (
        <>
          <NumberField name="salePriceUsd" label="Sale price" suffix="USD" hint="Blank = can't be sold yet." />
          <SelectField name="packagingItemId" label="Packaging" placeholder="None" options={packaging} />
        </>
      ) : null}
    </>
  );
}
