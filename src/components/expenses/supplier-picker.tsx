"use client";

import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useFieldState } from "@/components/form/action-form";
import { useFieldId } from "@/components/form/fields";
import { Field, Input } from "@/components/ui";
import { cn } from "@/lib/cn";
import { NEW_SUPPLIER } from "@/server/expenses/schema";

type Option = { value: string; label: string };
type Choice = { kind: "none" } | { kind: "existing"; id: string; label: string } | { kind: "new"; name: string };
type Row = { key: string; label: string; choice: Choice };

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const same = (a: string, b: string) => clean(a).toLowerCase() === clean(b).toLowerCase();

/**
 * Supplier search (ARIA combobox): type to filter, pick one, or keep a new name and it is created
 * with the expense. Leaving the field with a name that isn't in the list counts as a new supplier,
 * and says so under the field, so a hurried entry is never silently dropped.
 */
export function SupplierPicker({ suppliers }: { suppliers: Option[] }) {
  const saved = useFieldState("supplierId");
  const savedName = useFieldState("newSupplierName");
  const contact = useFieldState("newSupplierContact");
  const id = useFieldId("supplier");
  const contactId = useFieldId("newSupplierContact");
  const listId = `${useId().replace(/[^a-zA-Z0-9_-]/g, "")}-list`;
  const inputRef = useRef<HTMLInputElement>(null);

  const initial: Choice =
    saved.defaultValue === NEW_SUPPLIER && savedName.defaultValue
      ? { kind: "new", name: savedName.defaultValue }
      : (() => {
          const s = suppliers.find((o) => o.value === saved.defaultValue);
          return s ? { kind: "existing", id: s.value, label: s.label } : { kind: "none" };
        })();
  const [choice, setChoice] = useState<Choice>(initial);
  const [query, setQuery] = useState(
    initial.kind === "existing" ? initial.label : initial.kind === "new" ? initial.name : "",
  );
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const rows = useMemo<Row[]>(() => {
    const q = clean(query).toLowerCase();
    const matches = suppliers
      .filter((s) => !q || s.label.toLowerCase().includes(q))
      .map((s) => ({
        key: s.value,
        label: s.label,
        choice: { kind: "existing", id: s.value, label: s.label } as Choice,
      }));
    const exact = suppliers.some((s) => same(s.label, query));
    if (q && !exact)
      matches.push({
        key: NEW_SUPPLIER,
        label: `Add “${clean(query)}” as a new supplier`,
        choice: { kind: "new", name: clean(query) },
      });
    return matches;
  }, [query, suppliers]);

  function pick(c: Choice) {
    setChoice(c);
    setQuery(c.kind === "existing" ? c.label : c.kind === "new" ? c.name : "");
    setOpen(false);
  }

  /**
   * What the typed text means, kept current on every keystroke so pressing Enter to save never
   * sends a stale pick: an existing name (any capitals or spacing) is that supplier, other text
   * is a new one, empty is none.
   */
  function fromText(text: string): Choice {
    const t = clean(text);
    if (!t) return { kind: "none" };
    const hit = suppliers.find((s) => same(s.label, t));
    return hit ? { kind: "existing", id: hit.value, label: hit.label } : { kind: "new", name: t };
  }

  /** Leaving the field tidies the text to the supplier's saved spelling. */
  function settle() {
    setOpen(false);
    if (choice.kind === "existing") setQuery(choice.label);
    else if (choice.kind === "new") setQuery(choice.name);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) return setOpen(true);
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((a) => (rows.length ? (a + step + rows.length) % rows.length : 0));
    } else if (e.key === "Enter" && open && rows[active]) {
      e.preventDefault(); // pick, don't submit the form
      pick(rows[active].choice);
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      setOpen(false);
    }
  }

  const error = savedName.error ?? saved.error;
  const showList = open && (rows.length > 0 || !query);
  const hint =
    choice.kind === "new"
      ? `New supplier: “${choice.name}”. It's added when you save.`
      : suppliers.length
        ? "Type to search. A name that isn't listed is added as a new supplier."
        : "Type a name to add your first supplier.";

  return (
    <div className="flex flex-col gap-4">
      <input
        type="hidden"
        name="supplierId"
        value={choice.kind === "existing" ? choice.id : choice.kind === "new" ? NEW_SUPPLIER : ""}
      />
      {choice.kind === "new" ? <input type="hidden" name="newSupplierName" value={choice.name} /> : null}
      <Field id={id} label="Supplier" hint={<span aria-live="polite">{hint}</span>} error={error}>
        <div className="relative">
          <Input
            ref={inputRef}
            id={id}
            type="text"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={showList}
            aria-controls={listId}
            aria-activedescendant={showList && rows[active] ? `${listId}-${active}` : undefined}
            autoComplete="off"
            enterKeyHint="done"
            placeholder="None"
            value={query}
            invalid={!!error}
            className={cn(query && "pr-12")}
            onChange={(e) => {
              setQuery(e.target.value);
              setChoice(fromText(e.target.value));
              setActive(0);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onClick={() => setOpen(true)}
            onBlur={settle}
            onKeyDown={onKeyDown}
          />
          {query ? (
            <button
              type="button"
              aria-label="Clear supplier"
              className="absolute inset-y-0 right-0 inline-flex min-h-tap min-w-tap cursor-pointer items-center justify-center text-ink-muted hover:text-ink"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                pick({ kind: "none" });
                inputRef.current?.focus();
              }}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 20 20"
                className="size-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
              </svg>
            </button>
          ) : null}
          <ul
            id={listId}
            role="listbox"
            aria-label="Suppliers"
            hidden={!showList}
            className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-md border border-border-strong bg-surface p-1 shadow-raised"
          >
            {rows.map((r, i) => (
              <li
                key={r.key}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className={cn(
                  "flex min-h-tap cursor-pointer items-center rounded-sm px-3 text-md",
                  r.key === NEW_SUPPLIER ? "font-semibold text-action" : "text-ink",
                  i === active && "bg-action-soft",
                )}
                onMouseDown={(e) => e.preventDefault()} // keep focus so blur doesn't settle first
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(r.choice)}
              >
                {r.key === NEW_SUPPLIER ? `+ ${r.label}` : r.label}
              </li>
            ))}
            {!rows.length && !query ? (
              <li role="presentation" className="px-3 py-2 text-sm text-ink-muted">
                No suppliers yet. Type a name to add one.
              </li>
            ) : null}
          </ul>
        </div>
      </Field>
      {choice.kind === "new" ? (
        <Field id={contactId} label="New supplier's phone or link (optional)">
          <Input
            key={contact.version}
            id={contactId}
            name="newSupplierContact"
            autoComplete="off"
            defaultValue={contact.defaultValue}
          />
        </Field>
      ) : null}
    </div>
  );
}
