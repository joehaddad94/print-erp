"use client";

import { useId, type InputHTMLAttributes, type ReactNode } from "react";
import { Field, Input } from "@/components/ui";
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
  ...rest
}: Base & Omit<InputHTMLAttributes<HTMLInputElement>, "name" | "defaultValue">) {
  const { defaultValue, error, version } = useFieldState(name);
  const id = useFieldId(name);
  return (
    <Field id={id} label={label} hint={hint} error={error} optional={optional}>
      <Input key={version} id={id} name={name} defaultValue={defaultValue} invalid={!!error} {...rest} />
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

export function TextareaField({ name, label, hint, optional }: Base) {
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
        className="control px-3 py-2 text-ink"
      />
    </Field>
  );
}

/** USD/LBP choice plus the day's LBP rate when LBP is picked (D43). */
export function CurrencyFields({ lbpRateDefault }: { lbpRateDefault?: string }) {
  const { defaultValue } = useFieldState("currency");
  return (
    <div className="grid grid-cols-2 gap-3">
      <SelectField
        name="currency"
        label="Currency"
        options={[
          { value: "USD", label: "USD" },
          { value: "LBP", label: "LBP" },
        ]}
      />
      <NumberField
        name="lbpRate"
        label="LBP per USD"
        hint={defaultValue === "LBP" || !lbpRateDefault ? "Only for LBP" : `Settings: ${lbpRateDefault}`}
      />
    </div>
  );
}
