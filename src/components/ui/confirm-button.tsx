"use client";

import { useRef, useTransition, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Button, type ButtonVariant } from "./button";

/**
 * A button that asks first (prototype "Asks to confirm"): cancel, delete and remove never act on one tap.
 * Opens a small native dialog: what will happen, then Keep / the danger action.
 */
export function ConfirmButton({
  children,
  title,
  body,
  confirmLabel,
  action,
  variant = "quiet",
  className,
  ariaLabel,
}: {
  children: ReactNode;
  title: string;
  body?: ReactNode;
  confirmLabel: string;
  /** A server action already bound to its record. */
  action: () => Promise<unknown>;
  variant?: ButtonVariant;
  className?: string;
  ariaLabel?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <Button
        variant={variant}
        className={className}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        onClick={() => ref.current?.showModal()}
      >
        {children}
      </Button>
      <dialog
        ref={ref}
        aria-label={title}
        className={cn(
          "m-auto w-11/12 max-w-sm rounded-lg border border-border bg-surface p-0 text-ink shadow-raised",
          "backdrop:bg-black/40",
        )}
        onClick={(e) => {
          if (e.target === ref.current) ref.current?.close();
        }}
      >
        <div className="flex flex-col gap-3 p-5">
          <h2 className="text-lg font-semibold">{title}</h2>
          {body ? <div className="text-md text-ink-soft">{body}</div> : null}
          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => ref.current?.close()} autoFocus>
              Keep it
            </Button>
            <Button
              variant="danger"
              pending={pending}
              onClick={() =>
                start(async () => {
                  await action();
                  ref.current?.close();
                })
              }
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      </dialog>
    </>
  );
}
