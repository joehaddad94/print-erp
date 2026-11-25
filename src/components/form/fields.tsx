"use client";

import type { InputHTMLAttributes, ReactNode } from "react";
import { Field, Input } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useFieldState } from "./action-form";

type Base = { name: string; label: string; hint?: ReactNode };

export function TextField({
  name,
  label,
  hint,
  ...rest
}: Base & Omit<InputHTMLAttributes<HTMLInputElement>, "name" | "defaultValue">) {
  const { defaultValue, error, version } = useFieldState(name);
  return (
    <Field id={name} label={label} hint={hint} error={error}>
      <Input key={version} id={name} name={name} defaultValue={defaultValue} invalid={!!error} {...rest} />
    </Field>
  );
}

/** Numbers are typed as text with a decimal keyboard so "1,000" and "0.12" both work on phones. */
export function NumberField({ name, label, hint, suffix }: Base & { suffix?: string }) {
  const { defaultValue, error, version } = useFieldState(name);
  return (
    <Field id={name} label={label} hint={hint} error={error}>
      <div className="flex items-center gap-2">
        <Input
          key={version}
          id={name}
          name={name}
          inputMode="decimal"
          autoComplete="off"
          defaultValue={defaultValue}
          invalid={!!error}
          className="tabular-nums"
        />
        {suffix ? <span className="shrink-0 text-sm text-ink-muted">{suffix}</span> : null}
      </div>
    </Field>
  );
}

export function DateField({ name, label, hint }: Base) {
  const { defaultValue, error, version } = useFieldState(name);
  return (
    <Field id={name} label={label} hint={hint} error={error}>
      <Input key={version} id={name} name={name} type="date" defaultValue={defaultValue} invalid={!!error} />
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
}: Base & {
  options: { value: string; label: string }[];
  placeholder?: string;
  onValueChange?: (v: string) => void;
}) {
  const { defaultValue, error, version } = useFieldState(name);
  return (
    <Field id={name} label={label} hint={hint} error={error}>
      <select
        key={version}
        id={name}
        name={name}
        defaultValue={defaultValue}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${name}-error` : undefined}
        onChange={(e) => onValueChange?.(e.target.value)}
        className={cn("control px-3 text-md text-ink", error && "border-danger")}
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

export function TextareaField({ name, label, hint }: Base) {
  const { defaultValue, error, version } = useFieldState(name);
  return (
    <Field id={name} label={label} hint={hint} error={error}>
      <textarea
        key={version}
        id={name}
        name={name}
        rows={3}
        defaultValue={defaultValue}
        className="control px-3 py-2 text-md text-ink"
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
