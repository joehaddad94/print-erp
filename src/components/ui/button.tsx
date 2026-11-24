import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const variants = {
  primary: "bg-action text-action-ink font-bold",
  secondary: "border border-border bg-surface text-ink font-semibold",
  danger: "bg-danger-bg text-danger font-bold",
  ghost: "bg-transparent text-action font-semibold",
} as const;

export type ButtonVariant = keyof typeof variants;

export const buttonClass = (variant: ButtonVariant = "primary", block = false) =>
  cn(
    "inline-flex min-h-tap min-w-tap cursor-pointer items-center justify-center gap-2 rounded-md px-4 text-md",
    "transition-opacity disabled:cursor-not-allowed disabled:opacity-60",
    variants[variant],
    block && "w-full",
  );

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  block?: boolean;
};

export function Button({ variant = "primary", block, className, type = "button", ...rest }: ButtonProps) {
  return <button type={type} className={cn(buttonClass(variant, block), className)} {...rest} />;
}
