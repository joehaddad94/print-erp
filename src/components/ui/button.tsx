import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/**
 * One button system. Use one primary per screen; everything else is secondary
 * or quiet. Danger is outlined so a destructive action never looks like the default.
 */
const variants = {
  primary: "bg-action text-action-ink hover:bg-action-hover shadow-raised",
  secondary: "border border-border-strong bg-surface text-ink hover:bg-surface-muted",
  danger: "border border-danger bg-surface text-danger hover:bg-danger-bg",
  ghost: "bg-transparent text-action hover:bg-action-soft",
} as const;

export type ButtonVariant = keyof typeof variants;

/**
 * `block` = full width on phones, natural width from `sm` up, so desktop forms
 * don't get a 640px-wide bar of colour.
 */
export const buttonClass = (variant: ButtonVariant = "primary", block = false) =>
  cn(
    "inline-flex min-h-tap min-w-tap cursor-pointer items-center justify-center gap-2 rounded-md px-4 py-2 text-center text-md font-semibold",
    "disabled:cursor-not-allowed disabled:opacity-60 aria-disabled:cursor-not-allowed aria-disabled:opacity-60",
    variants[variant],
    block && "w-full sm:w-auto sm:self-start",
  );

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
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
      className="inline-block size-4 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent"
    />
  );
}
