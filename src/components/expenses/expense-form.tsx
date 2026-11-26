"use client";

import { useState } from "react";
import { ActionForm } from "@/components/form/action-form";
import {
  CurrencyFields,
  DateField,
  NumberField,
  SelectField,
  TextField,
  TextareaField,
} from "@/components/form/fields";
import { Link } from "@/components/ui/link";
import {
  CATEGORY_LABELS,
  PURCHASE_CATEGORIES,
  RUNNING_CATEGORIES,
  isPurchase,
  type ExpenseCategory,
} from "@/server/expenses/schema";
import { SupplierPicker } from "./supplier-picker";
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
  brands = [],
  lbpRate,
  editing = false,
  kind,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  defaults: Record<string, string>;
  suppliers: Option[];
  filaments: Option[];
  packaging: Option[];
  /** Filament brands entered before, offered as suggestions; a new one can still be typed. */
  brands?: string[];
  lbpRate?: string;
  editing?: boolean;
  /** R7: a purchase (into stock or a machine) or a running cost. On edit it follows the category. */
  kind?: "purchase" | "expense";
}) {
  const [category, setCategory] = useState(defaults.category ?? "");
  const purchase = kind ? kind === "purchase" : isPurchase(category as ExpenseCategory);
  const categories = purchase ? PURCHASE_CATEGORIES : RUNNING_CATEGORIES;
  const [filamentId, setFilamentId] = useState(defaults.filamentId ?? "");
  const [packagingId, setPackagingId] = useState(defaults.packagingId ?? "");

  return (
    <ActionForm
      action={action}
      defaults={defaults}
      submitLabel={editing ? "Save changes" : purchase ? "Save purchase" : "Save expense"}
    >
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
          options={categories.map((c) => ({ value: c, label: CATEGORY_LABELS[c] }))}
          onValueChange={setCategory}
          hint={
            purchase
              ? undefined
              : "Buying filament, packaging or a machine? Use Add purchase instead, so it goes into stock."
          }
        />
      )}
      {!purchase && !editing ? (
        <p className="-mt-2 text-sm">
          <Link
            href="/purchases/new"
            className="inline-flex min-h-control items-center font-medium text-action hover:underline"
          >
            Add purchase instead
          </Link>
        </p>
      ) : null}
      {!purchase ? <TextField name="description" label="What" placeholder="Fiber, December" hint="Optional." /> : null}
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
          <TextField
            name="brand"
            label="Brand"
            placeholder="eSun"
            hint="Optional. Pick one you used before or type a new one."
            list="filament-brands"
            autoComplete="off"
          />
          <datalist id="filament-brands">
            {brands.map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
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

      {purchase ? (
        <SupplierPicker suppliers={suppliers} />
      ) : (
        <>
          <TextField name="paidTo" label="Paid to" placeholder="IDM" hint="Optional." />
          <label className="flex min-h-control items-center gap-3 text-md">
            <input
              type="checkbox"
              name="repeatsMonthly"
              defaultChecked={defaults.repeatsMonthly === "true"}
              className="size-control shrink-0 accent-action"
            />
            Repeats every month
          </label>
        </>
      )}
      <TextareaField name="notes" label="Notes" />
    </ActionForm>
  );
}
