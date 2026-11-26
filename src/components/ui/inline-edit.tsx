"use client";

import { useEffect, useReducer, useRef, useTransition } from "react";
import { editReducer, initialEdit } from "@/lib/ui/inline-edit";
import { cn } from "@/lib/cn";

export type InlineSave = (value: string) => Promise<{ ok: true; value?: string } | { ok: false; error: string }>;

/**
 * InlineEdit (docs/DESIGN-SYSTEM.md §6): a value with a dashed underline on a detail screen.
 * Click or Enter to edit; Enter or leaving the field saves; Esc cancels.
 * `save` is a server action that validates, writes the edit log, and returns the stored value.
 */
export function InlineEdit({
  label,
  value,
  save,
  prefix,
  suffix,
  inputMode,
  wide,
}: {
  /** Names the value for screen readers, e.g. "price each". */
  label: string;
  value: string;
  save: InlineSave;
  prefix?: string;
  suffix?: string;
  inputMode?: "text" | "decimal" | "numeric" | "email" | "tel";
  wide?: boolean;
}) {
  const [state, send] = useReducer(editReducer, value, initialEdit);
  const [, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  // Entering "saving" happens once per edit (the reducer ignores a second Enter or blur), so this runs once.
  const draft = state.mode === "saving" ? state.draft : null;
  useEffect(() => {
    if (draft == null) return;
    startTransition(async () => {
      const res = await save(draft);
      if (res.ok) send({ type: "saved", value: res.value ?? draft });
      else send({ type: "failed", error: res.error });
    });
  }, [draft, save]);

  useEffect(() => {
    if (state.mode === "edit") inputRef.current?.select();
  }, [state.mode]);

  if (state.mode === "view") {
    return (
      <span className="inline-flex flex-col">
        <button
          type="button"
          onClick={() => send({ type: "open" })}
          aria-label={`${label}: ${state.value || "empty"}. Change`}
          className="min-h-6 cursor-text rounded-sm text-left underline decoration-ink-muted decoration-dashed underline-offset-4 hover:bg-surface-muted"
        >
          {prefix}
          {state.value || <span className="text-ink-muted">Add</span>}
          {suffix}
        </button>
        {state.error ? <span className="text-sm text-danger">{state.error}</span> : null}
      </span>
    );
  }

  const error = state.mode === "edit" ? state.error : undefined;
  return (
    <span className="inline-flex flex-col gap-1">
      <span className="inline-flex items-center gap-1">
        {prefix ? <span className="text-ink-muted">{prefix}</span> : null}
        <input
          ref={inputRef}
          aria-label={label}
          aria-invalid={error ? true : undefined}
          inputMode={inputMode}
          value={state.draft}
          disabled={state.mode === "saving"}
          onChange={(e) => send({ type: "type", draft: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              send({ type: "commit" });
            } else if (e.key === "Escape") {
              e.preventDefault();
              send({ type: "cancel" });
            }
          }}
          onBlur={() => send({ type: "commit" })}
          className={cn("control px-2", wide ? "w-56" : "w-28")}
        />
        {suffix ? <span className="text-ink-muted">{suffix}</span> : null}
      </span>
      {error ? (
        <span role="alert" className="text-sm text-danger">
          {error}
        </span>
      ) : null}
    </span>
  );
}
