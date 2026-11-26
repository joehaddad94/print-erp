import type { ReactNode } from "react";
import { Link } from "./link";

/** Ledger-list pattern: tappable rows, title + subline left, value right. */
export function List({ children, label }: { children: ReactNode; label: string }) {
  return (
    <ul
      aria-label={label}
      className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface"
    >
      {children}
    </ul>
  );
}

export function ListRow({
  href,
  title,
  subtitle,
  trailing,
  badge,
}: {
  href?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  badge?: ReactNode;
}) {
  const body = (
    <div className="flex min-h-13 items-center gap-4 px-4 py-2.5 lg:min-h-12">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{title}</p>
        {subtitle ? <p className="text-sm text-ink-muted">{subtitle}</p> : null}
        {badge ? <div className="pt-1">{badge}</div> : null}
      </div>
      {trailing ? <div className="shrink-0 text-right tabular-nums">{trailing}</div> : null}
    </div>
  );
  return (
    <li>
      {href ? (
        <Link href={href} className="block hover:bg-surface-muted">
          {body}
        </Link>
      ) : (
        body
      )}
    </li>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-5">
      <p className="font-medium text-ink-soft">{title}</p>
      {children ? <div className="pt-1 text-sm text-ink-muted">{children}</div> : null}
    </div>
  );
}

/** Screen title (left) with an optional one-line description and actions (right on desktop, below on phone). */
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight">{title}</h1>
        {description ? <p className="pt-0.5 text-sm text-ink-muted">{description}</p> : null}
      </div>
      {action ? <div className="flex flex-wrap gap-2">{action}</div> : null}
    </div>
  );
}

/** Section heading inside a screen. */
export function SectionTitle({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <h2 id={id} className="text-lg font-semibold">
      {children}
    </h2>
  );
}
