import { cn } from "@/lib/cn";

/** Grey placeholder block. Decorative: the wrapping region carries the "Loading" label. */
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("block animate-shimmer rounded-sm bg-skeleton", className)} />;
}

/** Placeholder for a whole screen: header, then a list card. Shown the instant a link is clicked. */
export function PageSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-6">
      <span className="sr-only">Loading…</span>
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-control w-32 rounded-md" />
      </div>
      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-border px-4 py-4 last:border-b-0">
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className={cn("h-3.5", i % 2 ? "w-1/2" : "w-2/3")} />
              <Skeleton className="h-3 w-1/3" />
            </div>
            <Skeleton className="h-3.5 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
