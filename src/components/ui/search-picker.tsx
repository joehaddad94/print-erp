"use client";

import { useId, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/shell/icons";
import { cn } from "@/lib/cn";
import { groupItems, moveActive, type PickerItem } from "@/lib/ui/picker";

/**
 * SearchPicker (docs/DESIGN-SYSTEM.md §6) for lists that grow: recipes, products, customers,
 * suppliers, filament. A combobox: type to filter, arrows and Enter to pick, Esc to close.
 * The choice shows as a card with a Change button and is submitted as `name` (hidden input).
 */
export function SearchPicker({
  name,
  label,
  items,
  recentIds = [],
  recentLabel,
  defaultId,
  value,
  error,
  placeholder = "Search",
  empty = "Nothing matches.",
  onChange,
}: {
  name: string;
  label: string;
  items: PickerItem[];
  recentIds?: string[];
  /** Heading of the first group (default "Recently used"), e.g. "Matches the file". */
  recentLabel?: string;
  defaultId?: string;
  /** Controlled choice: when set, the parent owns it (onChange reports picks). */
  value?: string | null;
  error?: string;
  placeholder?: string;
  empty?: string;
  onChange?: (id: string | null) => void;
}) {
  const uid = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [own, setOwn] = useState<string | null>(defaultId ?? null);
  const chosen = value !== undefined ? value || null : own;
  const setChosen = (id: string | null) => {
    if (value === undefined) setOwn(id);
  };
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const groups = useMemo(
    () => groupItems(items, query, recentIds, recentLabel),
    [items, query, recentIds, recentLabel],
  );
  const flat = groups.flatMap((g) => g.items);
  const picked = items.find((i) => i.id === chosen);

  const pick = (item: PickerItem) => {
    if (item.disabled) return;
    setChosen(item.id);
    setOpen(false);
    setQuery("");
    onChange?.(item.id);
  };

  const change = () => {
    setChosen(null);
    onChange?.(null);
    setOpen(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  return (
    <div role="group" aria-label={label} className="flex flex-col gap-1.5">
      <label htmlFor={`${uid}-q`} className="text-sm font-medium text-ink-soft">
        {label}
      </label>
      <input type="hidden" name={name} value={chosen ?? ""} />
      {picked ? (
        <div className="flex min-h-control items-center gap-3 rounded-md border border-border-strong bg-surface px-3 py-2">
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{picked.label}</span>
            {picked.sub ? <span className="block truncate text-sm text-ink-muted">{picked.sub}</span> : null}
          </span>
          <button
            type="button"
            onClick={change}
            className="min-h-control cursor-pointer rounded-md px-2.5 text-sm font-medium text-action hover:bg-action-soft"
          >
            Change
          </button>
        </div>
      ) : (
        <div className="relative">
          <Icon
            name="search"
            size={16}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-muted"
          />
          <input
            ref={inputRef}
            id={`${uid}-q`}
            role="combobox"
            aria-expanded={open}
            aria-controls={`${uid}-list`}
            aria-autocomplete="list"
            aria-activedescendant={open && active >= 0 ? `${uid}-o${active}` : undefined}
            autoComplete="off"
            value={query}
            placeholder={placeholder}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 120)}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
              setActive(-1);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                setOpen(true);
                setActive(moveActive(flat, active, e.key === "ArrowDown" ? 1 : -1));
              } else if (e.key === "Enter" && open && active >= 0) {
                e.preventDefault();
                pick(flat[active]!);
              } else if (e.key === "Escape") {
                setOpen(false);
              }
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${uid}-err` : undefined}
            className="control pr-3 pl-9"
          />
          {open ? (
            <div
              id={`${uid}-list`}
              role="listbox"
              aria-label={label}
              className="absolute inset-x-0 z-30 mt-1 max-h-80 overflow-y-auto rounded-md border border-border bg-surface p-1 shadow-overlay"
            >
              {flat.length === 0 ? <p className="px-3 py-2.5 text-sm text-ink-muted">{empty}</p> : null}
              {groups.map((g) => (
                <div key={g.label || "all"} role="group" aria-label={g.label || "All"}>
                  {g.label ? (
                    <p className="px-3 pt-2 pb-1 text-xs font-semibold tracking-wide text-ink-muted uppercase">
                      {g.label}
                    </p>
                  ) : null}
                  {g.items.map((item) => {
                    const i = flat.indexOf(item);
                    return (
                      <div
                        key={item.id}
                        id={`${uid}-o${i}`}
                        role="option"
                        aria-selected={i === active}
                        aria-disabled={item.disabled || undefined}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          pick(item);
                        }}
                        className={cn(
                          "flex min-h-control cursor-pointer items-center gap-3 rounded-sm px-3 py-1.5",
                          i === active && "bg-action-soft",
                          item.disabled ? "cursor-not-allowed opacity-60" : "hover:bg-surface-muted",
                        )}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{item.label}</span>
                          {item.sub ? <span className="block truncate text-sm text-ink-muted">{item.sub}</span> : null}
                        </span>
                        {item.badge ? (
                          <span className="rounded-sm bg-warning-bg px-1.5 text-xs font-medium text-warning">
                            {item.badge}
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}
      {error ? (
        <p id={`${uid}-err`} className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
