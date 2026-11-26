"use client";

import { useState } from "react";
import { ActionForm, useFieldState } from "@/components/form/action-form";
import { NumberField, SelectField, TextField } from "@/components/form/fields";
import { Segmented } from "@/components/ui/segmented";
import { SearchPicker } from "@/components/ui/search-picker";
import { adjustStockAction } from "@/server/stock/actions";

export type AdjustItem = {
  id: number;
  name: string;
  type: "filament" | "consumable" | "printed_part" | "finished_product";
  unit: "grams" | "pieces";
  onHand: number;
  emptySpoolWeightG: number | null;
};

const TYPE = { filament: "Filament", consumable: "Packaging", printed_part: "Part", finished_product: "Product" };
const qty = (n: number, unit: AdjustItem["unit"]) =>
  `${Number(n.toFixed(1)).toLocaleString("en-US")} ${unit === "grams" ? "g" : "pcs"}`;

/** R6 Adjust stock: pick the item, say how (weigh, new count, add or remove), and why. */
export function AdjustForm({ items, reasons }: { items: AdjustItem[]; reasons: readonly string[] }) {
  const [id, setId] = useState<string | null>(null);
  const item = items.find((i) => String(i.id) === id);
  const canWeigh = item?.type === "filament";
  const [mode, setMode] = useState("count");
  const how = canWeigh ? mode : mode === "weigh" ? "count" : mode;
  const u = item?.unit === "grams" ? "g" : undefined;
  return (
    <ActionForm
      action={adjustStockAction}
      submitLabel="Save adjustment"
      defaults={{ reason: how === "weigh" ? "Weighed" : "Counted", emptySpoolG: String(item?.emptySpoolWeightG ?? "") }}
    >
      <PickerWithError
        name="stockItemId"
        label="Item"
        placeholder="Search filament, packaging, parts, products"
        value={id}
        onChange={(v) => {
          setId(v);
          const next = items.find((i) => String(i.id) === v);
          setMode(next?.type === "filament" ? "weigh" : "count");
        }}
        items={items.map((i) => ({
          id: String(i.id),
          label: i.name,
          sub: `${TYPE[i.type]} · app thinks ${qty(i.onHand, i.unit)}`,
        }))}
      />
      {item ? (
        <>
          <input type="hidden" name="mode" value={how} />
          <Segmented
            key={`${item.id}`}
            name="how"
            legend="How"
            defaultValue={how}
            onChange={setMode}
            options={[
              ...(canWeigh ? [{ value: "weigh", label: "Weigh the spool" }] : []),
              { value: "count", label: "New count" },
              { value: "delta", label: "Add or remove" },
            ]}
          />
          {how === "weigh" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <NumberField name="scaleG" label="On the scale" suffix="g" hint="All open spools of it, added up." />
              <NumberField name="emptySpoolG" label="Empty spool" suffix="g" hint="Remembered for this filament." />
            </div>
          ) : how === "count" ? (
            <NumberField name="count" label="You have now" suffix={u} />
          ) : (
            <NumberField name="delta" label="Change by" suffix={u} hint="Minus to remove, plus to add." />
          )}
          <SelectField name="reason" label="Reason" options={reasons.map((r) => ({ value: r, label: r }))} />
          <TextField name="note" label="Note" placeholder="Monthly check" hint="Optional." />
        </>
      ) : null}
    </ActionForm>
  );
}

/** The picker shows the form's error ("Choose a stock item") from the ActionForm context. */
function PickerWithError(props: Omit<Parameters<typeof SearchPicker>[0], "error">) {
  const { error } = useFieldState(props.name);
  return <SearchPicker {...props} error={props.value ? undefined : error} />;
}
