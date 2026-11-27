import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

type FieldProps = {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string;
  /** Adds a muted "(optional)" after the label. */
  optional?: boolean;
  children: ReactNode;
};

/** Label + control + hint + error, wired with aria attributes. The control must use `id`. */
export function Field({ id, label, hint, error, optional, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink-soft">
        {label}
        {optional ? <span className="font-normal text-ink-muted"> (optional)</span> : null}
      </label>
      {children}
      {hint && !error ? (
        <p id={`${id}-hint`} className="text-xs text-ink-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

type InputProps = ComponentProps<"input"> & { invalid?: boolean };

export function Input({ className, invalid, id, ...rest }: InputProps) {
  return (
    <input
      id={id}
      aria-invalid={invalid || undefined}
      aria-describedby={invalid ? `${id}-error` : undefined}
      className={cn("control px-3 text-ink", "placeholder:text-ink-muted", invalid && "border-danger", className)}
      {...rest}
    />
  );
}

/**
 * Input with a unit or currency inside the box (prototype `.in .u`): "$ 22.50", "64 g", "70 %".
 * The text field itself stays a plain <input> so labels and autofill work.
 */
export function AffixInput({
  prefix,
  suffix,
  className,
  invalid,
  id,
  ...rest
}: InputProps & { prefix?: string; suffix?: string }) {
  if (!prefix && !suffix) return <Input id={id} invalid={invalid} className={className} {...rest} />;
  return (
    <div className={cn("flex control items-stretch gap-2 px-3 focus-within:border-action", invalid && "border-danger")}>
      {prefix ? <span className="self-center text-sm text-ink-muted">{prefix}</span> : null}
      <input
        id={id}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? `${id}-error` : undefined}
        className={cn(
          "-my-px min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-muted",
          className,
        )}
        {...rest}
      />
      {suffix ? <span className="self-center text-sm text-ink-muted">{suffix}</span> : null}
    </div>
  );
}
