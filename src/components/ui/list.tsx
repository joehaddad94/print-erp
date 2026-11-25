import Link from "next/link";
import type { ReactNode } from "react";

/** Ledger-list pattern from the mockup: tappable rows, title + subline left, value right. */
export function List({ children, label }: { children: ReactNode; label: string }) {
  return (
    <ul aria-label={label} className="divide-y divide-border rounded-md border border-border bg-surface">
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
    <div className="flex min-h-tap items-center gap-3 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{title}</p>
        {subtitle ? <p className="text-xs text-ink-muted">{subtitle}</p> : null}
        {badge ? <div className="pt-1">{badge}</div> : null}
      </div>
      {trailing ? <div className="shrink-0 text-right">{trailing}</div> : null}
    </div>
  );
  return <li>{href ? <Link href={href}>{body}</Link> : body}</li>;
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-border bg-surface px-4 py-8 text-center">
      <p className="font-semibold">{title}</p>
      {children ? <div className="pt-1 text-sm text-ink-muted">{children}</div> : null}
    </div>
  );
}

export function PageHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h1 className="text-xl font-bold">{title}</h1>
      {action}
    </div>
  );
}
