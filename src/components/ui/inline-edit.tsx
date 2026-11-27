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
  options,
  placeholder,
  display,
}: {
  /** Names the value for screen readers, e.g. "price each". */
  label: string;
  value: string;
  save: InlineSave;
  prefix?: string;
  suffix?: string;
  inputMode?: "text" | "decimal" | "numeric" | "email" | "tel";
  wide?: boolean;
  /** A choice instead of free text: the value is an option's `value`, the label is shown. */
  options?: { value: string; label: string }[];
  /** Shown (muted) when the value is empty. Default "Add". */
  placeholder?: string;
  /** Shown instead of a set value, e.g. "Change" for a long map link. */
  display?: string;
}) {
  const [state, send] = useReducer(editReducer, value, initialEdit);
  const [, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const shown = (v: string) =>
    v && display ? display : options ? (options.find((o) => o.value === v)?.label ?? v) : v;

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
    if (state.mode === "edit") {
      inputRef.current?.select();
      selectRef.current?.focus();
    }
  }, [state.mode]);

  if (state.mode === "view") {
    return (
      <span className="inline-flex flex-col">
        <button
          type="button"
          onClick={() => send({ type: "open" })}
          aria-label={`${label}: ${shown(state.value) ? `${prefix ?? ""}${shown(state.value)}${suffix ?? ""}` : (placeholder ?? "Add")}. Change`}
          className="min-h-tap min-w-tap cursor-text rounded-sm text-left underline decoration-ink-muted decoration-dashed underline-offset-4 hover:bg-surface-muted lg:min-h-6 lg:min-w-0"
        >
          {prefix}
          {shown(state.value) || <span className="text-ink-muted">{placeholder ?? "Add"}</span>}
          {suffix}
        </button>
        {state.error ? <span className="text-sm text-danger">{state.error}</span> : null}
      </span>
    );
  }

  const error = state.mode === "edit" ? state.error : undefined;
  if (options) {
    return (
      <span className="inline-flex flex-col gap-1">
        <select
          ref={selectRef}
          aria-label={label}
          aria-invalid={error ? true : undefined}
          value={state.draft}
          disabled={state.mode === "saving"}
          onChange={(e) => {
            send({ type: "type", draft: e.target.value });
            send({ type: "commit" });
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              send({ type: "cancel" });
            }
          }}
          onBlur={() => send({ type: "cancel" })}
          className={cn("control px-2", wide ? "w-56" : "w-40")}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {error ? (
          <span role="alert" className="text-sm text-danger">
            {error}
          </span>
        ) : null}
      </span>
    );
  }
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
