import { Link } from "@/components/ui/link";
import { cn } from "@/lib/cn";

/**
 * Filter pills for a list screen. With `all` (default) an "All" pill comes first; without it,
 * tapping the picked pill again shows everything. `count` shows after the label.
 */
export function Pills({
  current,
  base,
  options,
  param = "category",
  all = true,
}: {
  current: string | undefined;
  base: string;
  options: (readonly [string, string] | readonly [string, string, number])[];
  param?: string;
  all?: boolean;
}) {
  const list = all ? [["", "All"] as const, ...options] : options;
  return (
    <nav aria-label="Show" className="flex flex-wrap gap-1.5">
      {list.map(([k, label, count]) => (
        <Link
          key={k || "all"}
          href={k && (all || current !== k) ? `${base}?${param}=${k}` : base}
          aria-current={(current ?? "") === k ? "page" : undefined}
          className={cn(
            "flex min-h-control min-w-tap items-center justify-center rounded-full border px-3 text-sm font-medium",
            (current ?? "") === k
              ? "border-ink bg-ink text-surface"
              : "border-border-strong bg-surface text-ink-soft hover:bg-surface-muted",
          )}
        >
          {label}
          {count != null ? <span className="ml-1.5 text-xs font-normal tabular-nums">{count}</span> : null}
        </Link>
      ))}
    </nav>
  );
}
