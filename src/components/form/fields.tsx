"use client";

import { useId, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { Field, Input, Segmented } from "@/components/ui";
import { AffixInput } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { useFieldState } from "./action-form";

type Base = { name: string; label: string; hint?: ReactNode; optional?: boolean };

/**
 * A DOM id unique to this field instance. Next keeps up to 3 visited routes mounted but hidden
 * (React Activity), so two forms with the same field name (e.g. new + edit) would share an id and
 * the visible label would point at the hidden input. The name stays as the prefix for readability.
 */
export function useFieldId(name: string) {
  return `${name}-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

export function TextField({
  name,
  label,
  hint,
  optional,
  prefix,
  ...rest
}: Base & { prefix?: string } & Omit<InputHTMLAttributes<HTMLInputElement>, "name" | "defaultValue" | "prefix">) {
  const { defaultValue, error, version } = useFieldState(name);
  const id = useFieldId(name);
  return (
    <Field id={id} label={label} hint={hint} error={error} optional={optional}>
      {prefix ? (
        <AffixInput
          key={version}
          id={id}
          name={name}
          defaultValue={defaultValue}
          invalid={!!error}
          prefix={prefix}
          {...rest}
        />
      ) : (
        <Input key={version} id={id} name={name} defaultValue={defaultValue} invalid={!!error} {...rest} />
      )}
    </Field>
  );
}

/** Numbers are typed as text with a decimal keyboard so "1,000" and "0.12" both work on phones. */
/** The unit sits inside the box: "$ 22.50", "64 g" (prototype `.in .u`). */
export function NumberField({
  name,
  label,
  hint,
  optional,
  prefix,
  suffix,
  placeholder,
}: Base & { prefix?: string; suffix?: string; placeholder?: string }) {
  const { defaultValue, error, version } = useFieldState(name);
  const id = useFieldId(name);
  return (
    <Field id={id} label={label} hint={hint} error={error} optional={optional}>
      <AffixInput
        key={version}
        id={id}
        name={name}
        inputMode="decimal"
        autoComplete="off"
        defaultValue={defaultValue}
        placeholder={placeholder}
        invalid={!!error}
        prefix={prefix}
        suffix={suffix}
        className="tabular-nums"
      />
    </Field>
  );
}

export function DateField({ name, label, hint, optional }: Base) {
  const { defaultValue, error, version } = useFieldState(name);
  const id = useFieldId(name);
  return (
    <Field id={id} label={label} hint={hint} error={error} optional={optional}>
      <Input key={version} id={id} name={name} type="date" defaultValue={defaultValue} invalid={!!error} />
    </Field>
  );
}

export function SelectField({
  name,
  label,
  hint,
  options,
  placeholder,
  onValueChange,
  optional,
}: Base & {
  options: { value: string; label: string }[];
  placeholder?: string;
  onValueChange?: (v: string) => void;
}) {
  const { defaultValue, error, version } = useFieldState(name);
  const id = useFieldId(name);
  return (
    <Field id={id} label={label} hint={hint} error={error} optional={optional}>
      <select
        key={version}
        id={id}
        name={name}
        defaultValue={defaultValue}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(e) => onValueChange?.(e.target.value)}
        className={cn("control px-3 text-ink", error && "border-danger")}
      >
        {placeholder != null ? <option value="">{placeholder}</option> : null}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function TextareaField({ name, label, hint, optional, placeholder }: Base & { placeholder?: string }) {
  const { defaultValue, error, version } = useFieldState(name);
  const id = useFieldId(name);
  return (
    <Field id={id} label={label} hint={hint} error={error} optional={optional}>
      <textarea
        key={version}
        id={id}
        name={name}
        rows={3}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="control px-3 py-2 text-ink placeholder:text-ink-muted"
      />
    </Field>
  );
}

/** A segmented choice inside an ActionForm (prototype `.seg`): keeps the typed value after a failed save. */
export function SegmentedField({
  name,
  label,
  options,
  hint,
  onValueChange,
}: {
  name: string;
  label: string;
  options: readonly { value: string; label: string }[];
  hint?: ReactNode;
  onValueChange?: (v: string) => void;
}) {
  const { defaultValue, error, version } = useFieldState(name);
  return (
    <div className="flex flex-col gap-1.5">
      <Segmented
        key={version}
        name={name}
        legend={label}
        options={options}
        defaultValue={defaultValue || options[0]?.value}
        onChange={onValueChange}
      />
      {error ? <p className="text-sm font-medium text-danger">{error}</p> : null}
      {hint && !error ? <p className="text-xs text-ink-muted">{hint}</p> : null}
    </div>
  );
}

/** USD/LBP as a segmented choice; the day's LBP rate shows only for LBP, pre-filled from Settings (D43). */
export function CurrencyFields({ lbpRateDefault, beside }: { lbpRateDefault?: string; beside?: ReactNode }) {
  const { defaultValue } = useFieldState("currency");
  const [currency, setCurrency] = useState(defaultValue || "USD");
  return (
    <>
      <div className={beside ? "grid items-start gap-3 sm:grid-cols-2" : "contents"}>
        {beside}
        <SegmentedField
          name="currency"
          label="Currency"
          options={[
            { value: "USD", label: "USD" },
            { value: "LBP", label: "LBP" },
          ]}
          onValueChange={setCurrency}
        />
      </div>
      <div hidden={currency !== "LBP"}>
        <div className="grid gap-3 sm:grid-cols-2">
          <NumberField
            name="lbpRate"
            label="LBP per USD"
            hint={lbpRateDefault ? "Pre-filled from Settings." : "Today's rate."}
          />
        </div>
      </div>
    </>
  );
}
