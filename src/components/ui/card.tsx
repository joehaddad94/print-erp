import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-lg border border-border bg-surface p-4", className)} {...rest} />;
}

/**
 * Card with a header row: title, optional count chip, optional link or action on the right.
 * `flush` drops body padding for a table or list that runs edge to edge.
 */
export function Panel({
  title,
  titleId,
  count,
  action,
  flush,
  className,
  children,
}: {
  title: ReactNode;
  titleId?: string;
  count?: number;
  action?: ReactNode;
  flush?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={titleId}
      className={cn("overflow-hidden rounded-lg border border-border bg-surface", className)}
    >
      <div className="flex min-h-12 items-center gap-2 border-b border-border px-4">
        <h2 id={titleId} className="text-lg font-semibold">
          {title}
        </h2>
        {count != null ? (
          <span className="rounded-full bg-surface-muted px-2 text-xs text-ink-muted tabular-nums">{count}</span>
        ) : null}
        {action ? <div className="ml-auto flex items-center gap-2 text-sm">{action}</div> : null}
      </div>
      <div className={flush ? undefined : "p-4"}>{children}</div>
    </section>
  );
}
