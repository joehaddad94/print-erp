import type { ReactNode } from "react";
import { Icon } from "@/components/shell/icons";
import { cn } from "@/lib/cn";
import { Link } from "./link";

export type FilterOption = { key: string; label: string; count?: number };

/** Search box for list screens: a plain GET form, so it works before the page's JS loads. */
export function SearchBox({
  q,
  placeholder,
  label,
  keep = {},
}: {
  q?: string;
  placeholder: string;
  label: string;
  /** Other query params to keep when searching (e.g. the current pill). */
  keep?: Record<string, string | undefined>;
}) {
  return (
    <form role="search" method="get" className="w-full sm:w-64">
      {Object.entries(keep).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <label className="flex control items-stretch gap-2 px-3 focus-within:border-action">
        <span className="flex items-center text-ink-muted">
          <Icon name="search" size={16} />
        </span>
        <span className="sr-only">{label}</span>
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder={placeholder}
          autoComplete="off"
          className="-my-px min-w-0 flex-1 bg-transparent outline-none placeholder:text-ink-muted"
        />
      </label>
    </form>
  );
}

/**
 * Filters row of a list screen (prototype `.filters`): search, pills with counts, and an optional
 * slot on the right. Pills are links (`?{param}=key`), the search text is kept when switching.
 */
export function FilterBar({
  base,
  q,
  param = "type",
  current,
  options,
  placeholder,
  searchLabel,
  right,
}: {
  base: string;
  q?: string;
  param?: string;
  current?: string;
  options: FilterOption[];
  placeholder?: string;
  searchLabel?: string;
  right?: ReactNode;
}) {
  const href = (key: string) => {
    const sp = new URLSearchParams();
    if (key) sp.set(param, key);
    if (q) sp.set("q", q);
    const s = sp.toString();
    return s ? `${base}?${s}` : base;
  };
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      {placeholder ? (
        <SearchBox q={q} placeholder={placeholder} label={searchLabel ?? placeholder} keep={{ [param]: current }} />
      ) : null}
      <nav aria-label="Show" className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = (current ?? "") === o.key;
          return (
            <Link
              key={o.key || "all"}
              href={href(o.key)}
              aria-current={on ? "page" : undefined}
              className={cn(
                "flex min-h-control min-w-tap items-center justify-center gap-1.5 rounded-full border px-3 text-sm font-medium",
                on
                  ? "border-ink bg-ink text-surface"
                  : "border-border-strong bg-surface text-ink-soft hover:bg-surface-muted",
              )}
            >
              {o.label}
              {o.count != null ? (
                <span className={cn("text-xs tabular-nums", on ? "opacity-80" : "text-ink-muted")}>{o.count}</span>
              ) : null}
            </Link>
          );
        })}
      </nav>
      {right ? <div className="ml-auto">{right}</div> : null}
    </div>
  );
}

/** Case-insensitive "contains" on any of the given texts. */
export function matches(q: string | undefined, ...texts: (string | null | undefined)[]) {
  if (!q?.trim()) return true;
  const needle = q.trim().toLowerCase();
  return texts.some((t) => t?.toLowerCase().includes(needle));
}
