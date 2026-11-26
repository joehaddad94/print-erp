import { Link } from "@/components/ui/link";
import { cn } from "@/lib/cn";

/** Category filter pills ("All" first) for the money lists. */
export function Pills({
  current,
  base,
  options,
}: {
  current: string | undefined;
  base: string;
  options: (readonly [string, string])[];
}) {
  return (
    <nav aria-label="Show" className="flex flex-wrap gap-1.5">
      {[["", "All"] as const, ...options].map(([k, label]) => (
        <Link
          key={k || "all"}
          href={k ? `${base}?category=${k}` : base}
          aria-current={(current ?? "") === k ? "page" : undefined}
          className={cn(
            "flex min-h-control min-w-tap items-center justify-center rounded-full border px-3 text-sm font-medium",
            (current ?? "") === k
              ? "border-ink bg-ink text-surface"
              : "border-border-strong bg-surface text-ink-soft hover:bg-surface-muted",
          )}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
