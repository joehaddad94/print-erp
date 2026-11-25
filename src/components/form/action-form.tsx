"use client";

import { Link } from "@/components/ui/link";
import { createContext, useActionState, useContext, type ReactNode } from "react";
import { Button, Callout } from "@/components/ui";
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
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  defaults?: Record<string, string>;
  submitLabel: string;
  children: ReactNode;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <FormCtx.Provider value={{ state, defaults }}>
      <form action={formAction} noValidate className={className ?? "flex flex-col gap-4"}>
        {state.error ? (
          <Callout tone="danger">
            {state.error}
            {state.link ? (
              <>
                {" "}
                <Link className="inline-flex min-h-tap items-center font-semibold underline" href={state.link}>
                  Fix it
                </Link>
              </>
            ) : null}
          </Callout>
        ) : null}
        {state.ok && state.message ? <Callout tone="success">{state.message}</Callout> : null}
        {children}
        <Button type="submit" block pending={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
      </form>
    </FormCtx.Provider>
  );
}
