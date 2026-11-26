"use client";

import { useId, useMemo, useRef, useState, useTransition, type KeyboardEvent } from "react";
import { useFieldState } from "@/components/form/action-form";
import { useFieldId } from "@/components/form/fields";
import { Button, Field, Input } from "@/components/ui";
import { cn } from "@/lib/cn";
import { quickAddSupplierAction } from "@/server/suppliers/actions";

type Option = { value: string; label: string };

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const same = (a: string, b: string) => clean(a).toLowerCase() === clean(b).toLowerCase();

/**
 * Supplier on the expense form. The search box only picks suppliers you already have; a new one
 * is added with the "+ New supplier" button beside it (saved at once, then picked). Text typed in
 * the search but never picked is refused on save, so a typo never becomes a supplier or vanishes.
 */
export function SupplierPicker({ suppliers }: { suppliers: Option[] }) {
  const saved = useFieldState("supplierId");
  const savedSearch = useFieldState("supplierSearch");
  const id = useFieldId("supplier");
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const listId = `${uid}-list`;
  const inputRef = useRef<HTMLInputElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);

  const [options, setOptions] = useState(suppliers);
  const initial = options.find((o) => o.value === saved.defaultValue) ?? null;
  const [picked, setPicked] = useState<Option | null>(initial);
  const [query, setQuery] = useState(initial?.label ?? savedSearch.defaultValue);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [adding, setAdding] = useState(false);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [dismissedFor, setDismissedFor] = useState<number | null>(null);

  const rows = useMemo(() => {
    const q = clean(query).toLowerCase();
    return options.filter((s) => !q || s.label.toLowerCase().includes(q));
  }, [query, options]);

  function pick(o: Option | null) {
    setDismissedFor(saved.version);
    setPicked(o);
    setQuery(o?.label ?? "");
    setOpen(false);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) return setOpen(true);
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((a) => (rows.length ? (a + step + rows.length) % rows.length : 0));
    } else if (e.key === "Enter" && open && rows[active]) {
      e.preventDefault(); // pick, don't submit the form
      pick(rows[active]);
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      setOpen(false);
    }
  }

  const unmatched = !picked && clean(query) !== "";
  // A save error about the supplier goes away as soon as the supplier is changed.
  const error = dismissedFor === saved.version ? undefined : saved.error;
  const showList = open && !adding;
  const hint = justAdded
    ? `Added “${justAdded}” and picked it.`
    : unmatched
      ? "Not in your list. Pick a supplier, or add it with + New supplier."
      : options.length
        ? "Type to search your suppliers."
        : "No suppliers yet. Use + New supplier to add one.";

  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name="supplierId" value={picked?.value ?? ""} />
      <div className="flex flex-col gap-1.5">
        <div className="flex items-end justify-between gap-2">
          <label htmlFor={id} className="pb-1 text-sm font-semibold">
            Supplier
          </label>
          {!adding ? (
            <Button
              ref={addButtonRef}
              variant="ghost"
              className="-mr-2 px-2"
              onClick={() => {
                setOpen(false);
                setJustAdded(null);
                setAdding(true);
              }}
            >
              + New supplier
            </Button>
          ) : null}
        </div>
        <div className="relative">
          <Input
            ref={inputRef}
            id={id}
            name="supplierSearch"
            type="text"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={showList}
            aria-controls={listId}
            aria-activedescendant={showList && rows[active] ? `${listId}-${active}` : undefined}
            aria-describedby={error ? `${id}-error` : `${id}-hint`}
            aria-invalid={error ? true : undefined}
            autoComplete="off"
            enterKeyHint="done"
            placeholder="None"
            value={query}
            invalid={!!error}
            className={cn(query && "pr-12")}
            onChange={(e) => {
              const text = e.target.value;
              setQuery(text);
              setDismissedFor(saved.version);
              // An exact name (any capitals or spacing) counts as picked, even without tapping it.
              setPicked(options.find((o) => same(o.label, text)) ?? null);
              setJustAdded(null);
              setActive(0);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onClick={() => setOpen(true)}
            onBlur={() => {
              setOpen(false);
              if (picked) setQuery(picked.label);
            }}
            onKeyDown={onKeyDown}
          />
          {query ? (
            <button
              type="button"
              aria-label="Clear supplier"
              className="absolute inset-y-0 right-0 inline-flex min-h-control min-w-control cursor-pointer items-center justify-center text-ink-muted hover:text-ink"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                pick(null);
                setJustAdded(null);
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
                key={r.value}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className={cn(
                  "flex min-h-control cursor-pointer items-center rounded-sm px-3 text-md text-ink",
                  i === active && "bg-action-soft",
                )}
                onMouseDown={(e) => e.preventDefault()} // keep focus so blur doesn't run first
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(r)}
              >
                {r.label}
              </li>
            ))}
            {!rows.length ? (
              <li role="presentation" className="px-3 py-2 text-sm text-ink-muted">
                {options.length ? "No supplier matches." : "No suppliers yet."} Use + New supplier above.
              </li>
            ) : null}
          </ul>
        </div>
        {error ? (
          <p id={`${id}-error`} role="alert" className="text-sm font-semibold text-danger">
            {error}
          </p>
        ) : (
          <p id={`${id}-hint`} aria-live="polite" className="text-xs text-ink-muted">
            {hint}
          </p>
        )}
      </div>

      {adding ? (
        <NewSupplierPanel
          initialName={unmatched ? clean(query) : ""}
          onCancel={() => {
            setAdding(false);
            requestAnimationFrame(() => addButtonRef.current?.focus());
          }}
          onAdded={(s) => {
            const opt = { value: String(s.id), label: s.name };
            setOptions((prev) =>
              prev.some((o) => o.value === opt.value)
                ? prev
                : [...prev, opt].sort((a, b) => a.label.localeCompare(b.label)),
            );
            pick(opt);
            setJustAdded(s.name);
            setAdding(false);
            requestAnimationFrame(() => addButtonRef.current?.focus());
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * Small inline form for a new supplier. Its fields have no `name`, so they never post with the
 * expense; "Save supplier" saves it on its own, straight away.
 */
function NewSupplierPanel({
  initialName,
  onCancel,
  onAdded,
}: {
  initialName: string;
  onCancel: () => void;
  onAdded: (s: { id: number; name: string }) => void;
}) {
  const nameId = useFieldId("newSupplierName");
  const contactId = useFieldId("newSupplierContact");
  const [name, setName] = useState(initialName);
  const [contact, setContact] = useState("");
  const [error, setError] = useState<{ field?: "name" | "contact"; message: string } | null>(null);
  const [pending, start] = useTransition();

  function save() {
    start(async () => {
      const r = await quickAddSupplierAction(name, contact);
      if (r.ok) onAdded(r);
      else setError({ field: r.field, message: r.error });
    });
  }

  /** Enter saves the supplier (not the expense); Escape closes the panel. */
  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (!pending) save();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  }

  return (
    <fieldset className="flex flex-col gap-4 rounded-md border border-border bg-surface-muted p-3">
      <legend className="px-1 text-sm font-semibold">New supplier</legend>
      <Field id={nameId} label="Supplier name" error={error?.field === "name" ? error.message : undefined}>
        <Input
          id={nameId}
          value={name}
          autoComplete="off"
          enterKeyHint="done"
          autoFocus
          invalid={error?.field === "name"}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={onKeyDown}
        />
      </Field>
      <Field
        id={contactId}
        label="Phone or link (optional)"
        error={error?.field === "contact" ? error.message : undefined}
      >
        <Input
          id={contactId}
          value={contact}
          autoComplete="off"
          enterKeyHint="done"
          invalid={error?.field === "contact"}
          onChange={(e) => setContact(e.target.value)}
          onKeyDown={onKeyDown}
        />
      </Field>
      {error && !error.field ? (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error.message}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" pending={pending} onClick={save}>
          {pending ? "Saving…" : "Save supplier"}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
      </div>
    </fieldset>
  );
}
