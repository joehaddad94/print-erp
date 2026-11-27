"use client";

import { Link } from "@/components/ui/link";
import { createContext, useActionState, useContext, type ReactNode } from "react";
import { Button, Callout, FormBar, buttonClass } from "@/components/ui";
import type { FormState } from "@/server/form";

type Ctx = { state: FormState; defaults: Record<string, string> };
const FormCtx = createContext<Ctx>({ state: {}, defaults: {} });

/** Value to show in a field: what was just typed (after a failed save) or the saved default. */
export function useFieldState(name: string) {
  const { state, defaults } = useContext(FormCtx);
  return {
    defaultValue: state.values?.[name] ?? defaults[name] ?? "",
    error: state.fieldErrors?.[name],
    version: state.version ?? 0,
  };
}

/**
 * Every Server Action form: inline field errors, one error callout, success message,
 * and typed values kept after a failed save (D41).
 */
export function ActionForm({
  action,
  defaults = {},
  submitLabel,
  children,
  className,
  bar,
  cancelHref,
  submitVariant,
  aside,
  onFieldInput,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  defaults?: Record<string, string>;
  submitLabel: string;
  children: ReactNode;
  className?: string;
  /** Screen-level form: Save (+ Cancel) in the form bar, pinned above the tab bar on phones. */
  bar?: boolean;
  cancelHref?: string;
  /** "secondary" for a form that is not the screen's main action (e.g. Save adjustments). */
  submitVariant?: "primary" | "secondary";
  /**
   * A live summary panel (prototype `.grid-aside`): right of the form and sticky on desktop,
   * between the fields and the Save bar on phones.
   */
  aside?: ReactNode;
  /** Every typed or picked value, so a live summary can follow the fields without owning them. */
  onFieldInput?: (name: string, value: string) => void;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const barEl =
    bar || cancelHref ? (
      <FormBar
        primary={
          <Button type="submit" pending={pending}>
            {pending ? "Saving…" : submitLabel}
          </Button>
        }
        secondary={
          cancelHref ? (
            <Link href={cancelHref} className={buttonClass("secondary")}>
              Cancel
            </Link>
          ) : undefined
        }
      />
    ) : (
      <Button type="submit" block variant={submitVariant} pending={pending}>
        {pending ? "Saving…" : submitLabel}
      </Button>
    );
  return (
    <FormCtx.Provider value={{ state, defaults }}>
      <form
        action={formAction}
        noValidate
        onInput={
          onFieldInput
            ? (e) => {
                const t = e.target as HTMLInputElement;
                if (t.name) onFieldInput(t.name, t.type === "checkbox" ? String(t.checked) : t.value);
              }
            : undefined
        }
        className={aside ? "grid items-start gap-5 lg:grid-aside" : (className ?? "flex flex-col gap-4")}
      >
        <Wrap on={!!aside} className={className ?? "flex min-w-0 flex-col gap-5"}>
          {state.error ? (
            <Callout tone="danger">
              {state.error}
              {state.link ? (
                <>
                  {" "}
                  <Link className="inline-flex min-h-control items-center font-semibold underline" href={state.link}>
                    Fix it
                  </Link>
                </>
              ) : null}
            </Callout>
          ) : null}
          {state.ok && state.message ? <Callout tone="success">{state.message}</Callout> : null}
          {children}
        </Wrap>
        {aside ? (
          <div className="flex min-w-0 flex-col gap-5 lg:sticky lg:top-4 lg:col-start-2 lg:row-span-2 lg:row-start-1">
            {aside}
          </div>
        ) : null}
        {aside ? <div className="min-w-0 lg:col-start-1">{barEl}</div> : barEl}
      </form>
    </FormCtx.Provider>
  );
}

/** Groups the fields into the left column when the form has an aside; otherwise renders them as they are. */
function Wrap({ on, className, children }: { on: boolean; className: string; children: ReactNode }) {
  return on ? <div className={className}>{children}</div> : <>{children}</>;
}
