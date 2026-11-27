"use client";

import { useState } from "react";
import { ActionForm, useFieldState } from "@/components/form/action-form";
import { NumberField, SegmentedField, SelectField, TextField } from "@/components/form/fields";
import { Card } from "@/components/ui";
import { createStockItemAction } from "@/server/stock/actions";

const TYPES = [
  { value: "filament", label: "Filament" },
  { value: "packaging", label: "Packaging" },
  { value: "other", label: "Other stock" },
];
const MATERIALS = ["PLA", "PETG", "TPU", "ABS", "ASA", "Other"].map((m) => ({ value: m, label: m }));

/** New stock item (prototype /stock/new): type, what it is, a warning level, and an optional opening count. */
export function NewStockItemForm() {
  return (
    <ActionForm
      action={createStockItemAction}
      submitLabel="Create stock item"
      cancelHref="/stock"
      defaults={{ type: "filament", material: "PLA" }}
    >
      <Fields />
    </ActionForm>
  );
}

function Fields() {
  const saved = useFieldState("type");
  return <TypedFields key={saved.version} initial={saved.defaultValue || "filament"} />;
}

function TypedFields({ initial }: { initial: string }) {
  const [type, setType] = useState(initial);
  const filament = type === "filament";
  const unit = filament ? "g" : "pcs";
  return (
    <>
      <Card className="flex flex-col gap-4">
        <SegmentedField name="type" label="Type" options={TYPES} onValueChange={setType} />
        {filament ? (
          <div className="grid grid-cols-2 gap-3">
            <SelectField name="material" label="Material" options={MATERIALS} />
            <TextField name="color" label="Colour" placeholder="Silk gold" />
          </div>
        ) : (
          <TextField
            name="name"
            label="Name"
            placeholder={type === "packaging" ? "Large box 30 × 20 cm" : "Magnets 6 × 3 mm"}
          />
        )}
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            name="reorderLevel"
            label="Warn me below"
            optional
            suffix={unit}
            placeholder={filament ? "200" : "10"}
            hint="Shows “Low” in Stock and on Today."
          />
        </div>
      </Card>
      <Card className="flex flex-col gap-4">
        <h2 className="text-xs font-semibold tracking-wider text-ink-muted uppercase">
          Already have some? <span className="font-normal tracking-normal normal-case">(optional)</span>
        </h2>
        <div className="grid items-start gap-3 sm:grid-cols-2">
          <NumberField name="quantity" label="Quantity now" suffix={unit} placeholder={filament ? "750" : "20"} />
          <NumberField
            name="price"
            label="Price paid"
            prefix="$"
            suffix={filament ? "per kg" : "each"}
            placeholder={filament ? "19.00" : "0.50"}
            hint="Needed with a quantity, so prints using it have a cost."
          />
        </div>
        <p className="text-xs text-ink-muted">
          This is an opening count, not a purchase: no money is recorded. Use Add purchase when you buy more.
        </p>
      </Card>
    </>
  );
}
