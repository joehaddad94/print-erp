import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

/**
 * One button system. Use one primary per screen; everything else is secondary
 * or quiet. Danger is outlined so a destructive action never looks like the default.
 */
const variants = {
  primary: "bg-action text-action-ink hover:bg-action-hover",
  secondary: "border border-border-strong bg-surface text-ink hover:bg-surface-muted shadow-raised",
  danger: "border border-danger bg-surface text-danger hover:bg-danger-bg",
  ghost: "bg-transparent text-action hover:bg-action-soft",
  /** Text-only, for low-weight actions in rows and panels. */
  quiet: "bg-transparent text-ink-soft hover:bg-surface-muted hover:text-ink",
} as const;

export type ButtonVariant = keyof typeof variants;

/**
 * `block` = full width on phones, natural width from `sm` up, so desktop forms
 * don't get a 640px-wide bar of colour.
 */
export const buttonClass = (variant: ButtonVariant = "primary", block = false) =>
  cn(
    "inline-flex min-h-control min-w-control cursor-pointer items-center justify-center gap-1.5 rounded-md px-3.5 py-1.5 text-center text-md font-medium",
    "disabled:cursor-not-allowed disabled:opacity-60 aria-disabled:cursor-not-allowed aria-disabled:opacity-60",
    variants[variant],
    block && "w-full sm:w-auto sm:self-start",
  );

type ButtonProps = ComponentProps<"button"> & {
  variant?: ButtonVariant;
  block?: boolean;
  /** Shows a spinner and disables the button (e.g. while a form saves). */
  pending?: boolean;
};

export function Button({
  variant = "primary",
  block,
  pending,
  className,
  type = "button",
  disabled,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      className={cn(buttonClass(variant, block), className)}
      {...rest}
    >
      {pending ? <Spinner /> : null}
      {children}
    </button>
  );
}

export function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="inline-block size-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent"
    />
  );
}
