"use client";

import { useState } from "react";
import { ActionForm, useFieldState } from "@/components/form/action-form";
import { Button } from "@/components/ui";
import {
  CurrencyFields,
  DateField,
  NumberField,
  SelectField,
  TextField,
  TextareaField,
} from "@/components/form/fields";
import { CATEGORY_LABELS, EXPENSE_CATEGORIES, NEW_SUPPLIER } from "@/server/expenses/schema";
import type { FormState } from "@/server/form";

type Option = { value: string; label: string };

/**
 * Add expense / edit expense (D9, D23, D30, D43, D46). Purchases show what was bought;
 * on edit the category and the item are fixed, only amounts, dates and quantities change.
 */
export function ExpenseForm({
  action,
  defaults,
  suppliers,
  filaments,
  packaging,
  lbpRate,
  editing = false,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  defaults: Record<string, string>;
  suppliers: Option[];
  filaments: Option[];
  packaging: Option[];
  lbpRate?: string;
  editing?: boolean;
}) {
  const [category, setCategory] = useState(defaults.category ?? "");
  const [filamentId, setFilamentId] = useState(defaults.filamentId ?? "");
  const [packagingId, setPackagingId] = useState(defaults.packagingId ?? "");

  return (
    <ActionForm action={action} defaults={defaults} submitLabel={editing ? "Save changes" : "Save expense"}>
      {editing ? (
        <>
          <input type="hidden" name="category" value={category} />
          <p className="text-sm">
            <span className="font-semibold">Category:</span> {CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS]}
          </p>
        </>
      ) : (
        <SelectField
          name="category"
          label="Category"
          placeholder="Choose…"
          options={EXPENSE_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] }))}
          onValueChange={setCategory}
        />
      )}
      <div className="grid grid-cols-2 gap-3">
        <NumberField name="amount" label="Amount" />
        <DateField name="spentOn" label="Date" />
      </div>
      <CurrencyFields lbpRateDefault={lbpRate} />

      {category === "filament" ? (
        <fieldset className="flex flex-col gap-4 rounded-md border border-border p-3">
          <legend className="px-1 text-sm font-semibold">Filament bought</legend>
          {editing ? (
            <input type="hidden" name="filamentId" value={filamentId} />
          ) : (
            <SelectField
              name="filamentId"
              label="Filament (material + colour)"
              placeholder="New filament…"
              options={filaments}
              onValueChange={setFilamentId}
            />
          )}
          {!editing && !filamentId ? (
            <div className="grid grid-cols-2 gap-3">
              <TextField name="newMaterial" label="Material" placeholder="PLA" />
              <TextField name="newColor" label="Colour" placeholder="Black" />
              <NumberField name="emptySpoolWeightG" label="Empty spool (g)" hint="For weigh-ins" />
            </div>
          ) : null}
          <NumberField name="grams" label="Grams bought" suffix="g" hint="A 1 kg spool is 1000 g." />
        </fieldset>
      ) : null}

      {category === "packaging" ? (
        <fieldset className="flex flex-col gap-4 rounded-md border border-border p-3">
          <legend className="px-1 text-sm font-semibold">Packaging bought</legend>
          {editing ? (
            <input type="hidden" name="packagingId" value={packagingId} />
          ) : (
            <SelectField
              name="packagingId"
              label="Packaging item"
              placeholder="New item…"
              options={packaging}
              onValueChange={setPackagingId}
            />
          )}
          {!editing && !packagingId ? <TextField name="newPackagingName" label="New item name" /> : null}
          <NumberField name="pieces" label="Pieces" />
        </fieldset>
      ) : null}

      {category === "machine" && !editing ? (
        <fieldset className="flex flex-col gap-4 rounded-md border border-border p-3">
          <legend className="px-1 text-sm font-semibold">Machine bought</legend>
          <TextField name="machineName" label="Name" />
          <SelectField
            name="machineType"
            label="Type"
            options={[
              { value: "printer", label: "Printer" },
              { value: "equipment", label: "Equipment" },
            ]}
          />
          <TextField name="machineModel" label="Model" />
        </fieldset>
      ) : null}
      {category === "machine" && editing ? <input type="hidden" name="machineName" value="(kept)" /> : null}

      <SupplierPicker suppliers={suppliers} />
      <TextareaField name="notes" label="Notes" />
    </ActionForm>
  );
}

/**
 * Pick a supplier, or choose "+ New supplier…" and type a name (and, if handy, a phone) right
 * here. The supplier is saved with the expense, so there is no second form and nothing to lose.
 */
function SupplierPicker({ suppliers }: { suppliers: Option[] }) {
  const { defaultValue } = useFieldState("supplierId");
  const [choice, setChoice] = useState(defaultValue);
  const adding = choice === NEW_SUPPLIER;

  return (
    <div className="flex flex-col gap-3">
      <SelectField
        name="supplierId"
        label="Supplier"
        placeholder="None"
        options={[...suppliers, { value: NEW_SUPPLIER, label: "+ New supplier…" }]}
        value={choice}
        onValueChange={setChoice}
        hint={adding ? undefined : "Not in the list? Choose “+ New supplier…” at the bottom."}
      />
      {adding ? (
        <fieldset className="flex flex-col gap-4 rounded-md border border-border p-3">
          <legend className="px-1 text-sm font-semibold">New supplier</legend>
          <TextField
            name="newSupplierName"
            label="Supplier name"
            autoComplete="off"
            autoFocus
            hint="Saved with this expense. Shows in Suppliers afterwards."
          />
          <TextField name="newSupplierContact" label="Phone or link (optional)" autoComplete="off" />
          <Button variant="ghost" className="self-start" onClick={() => setChoice("")}>
            Pick from the list instead
          </Button>
        </fieldset>
      ) : null}
    </div>
  );
}
