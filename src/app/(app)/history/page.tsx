import { Badge, Callout, DataTable, PageHeader, Panel, formatWhen, type Column } from "@/components/ui";
import { buttonClass } from "@/components/ui/button";
import { Link } from "@/components/ui/link";
import { db } from "@/db";
import { cn } from "@/lib/cn";
import { listPeople } from "@/server/auth/service";
import { requireOwner } from "@/server/auth/session";
import { restoreChangeAction } from "@/server/history/actions";
import { AREAS, historyFeed, type Area } from "@/server/history/service";

type Row = Awaited<ReturnType<typeof historyFeed>>[number];

const PERIODS = [
  { key: "7d", label: "Last 7 days" },
  { key: "month", label: "This month" },
  { key: "all", label: "All time" },
] as const;

const one = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);

function show(v: unknown) {
  if (v == null || v === "") return null;
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function since(period: string): Date | undefined {
  const now = new Date();
  if (period === "7d") return new Date(now.getTime() - 7 * 86_400_000);
  if (period === "month") return new Date(now.getFullYear(), now.getMonth(), 1);
  return undefined;
}

/** R2 Change history (owner only): every edit, delete and adjustment, with Restore. */
export default async function HistoryPage({ searchParams }: PageProps<"/history">) {
  await requireOwner();
  const p = await searchParams;
  const area = one(p.area) && one(p.area)! in AREAS ? (one(p.area) as Area) : undefined;
  const who = Number(one(p.who)) || undefined;
  const period = PERIODS.some((x) => x.key === one(p.period)) ? one(p.period)! : "all";
  const q = one(p.q)?.slice(0, 80);
  const [rows, people] = await Promise.all([
    historyFeed(db(), { area, who, since: since(period), q }),
    listPeople(db()),
  ]);

  const qs = (over: Record<string, string | undefined>) => {
    const u = new URLSearchParams();
    const all = { q, area, who: who ? String(who) : undefined, period, ...over };
    for (const [k, v] of Object.entries(all)) if (v && !(k === "period" && v === "all")) u.set(k, v);
    const s = u.toString();
    return s ? `/history?${s}` : "/history";
  };
  const back = qs({});

  const columns: Column<Row>[] = [
    { key: "when", header: "When", cell: (r) => formatWhen(r.when) },
    { key: "who", header: "Who", cell: (r) => r.who ?? <span className="text-ink-muted">App</span> },
    { key: "area", header: "Area", cell: (r) => (r.area ? <Badge>{AREAS[r.area].label}</Badge> : null) },
    {
      key: "item",
      header: "Item",
      cell: (r) =>
        r.href ? (
          <Link href={r.href} className="inline-flex min-h-6 items-center text-action hover:underline">
            {r.item}
          </Link>
        ) : (
          r.item
        ),
    },
    { key: "what", header: "What changed", cell: (r) => <span className="font-medium">{r.what}</span> },
    { key: "before", header: "Before", truncate: true, cell: (r) => <Value v={r.before} kind="before" /> },
    { key: "after", header: "After", truncate: true, cell: (r) => <Value v={r.after} kind="after" /> },
    {
      key: "reason",
      header: "Reason or note",
      truncate: true,
      cell: (r) => r.reason ?? <span className="text-ink-muted">—</span>,
    },
    { key: "restore", header: "", cell: (r) => (r.restorable ? <RestoreButton id={r.id} back={back} /> : null) },
  ];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Change history"
        badges={<Badge>Owner only</Badge>}
        description="Every edit, delete and adjustment: who did it, what it was before, and why."
      />
      {one(p.restored) ? <Callout tone="success">Restored. The undo is logged below too.</Callout> : null}
      {one(p.error) ? <Callout tone="danger">{one(p.error)}</Callout> : null}

      <form className="flex flex-wrap items-end gap-2" action="/history">
        <label className="flex min-w-56 flex-1 flex-col gap-1 text-sm font-medium text-ink-soft">
          Search
          <input name="q" defaultValue={q} placeholder="e.g. #1042 or PLA" className="control px-3" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-ink-soft">
          Area
          <select name="area" defaultValue={area ?? ""} className="control px-3">
            <option value="">All areas</option>
            {(Object.keys(AREAS) as Area[]).map((a) => (
              <option key={a} value={a}>
                {AREAS[a].label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-ink-soft">
          Who
          <select name="who" defaultValue={who ? String(who) : ""} className="control px-3">
            <option value="">Anyone</option>
            {people.map((u) => (
              <option key={u.id} value={u.id}>
                {u.username}
              </option>
            ))}
          </select>
        </label>
        <input type="hidden" name="period" value={period} />
        <button type="submit" className={buttonClass("secondary")}>
          Show
        </button>
      </form>
      <nav aria-label="Period" className="flex flex-wrap gap-1.5">
        {PERIODS.map((x) => (
          <Link
            key={x.key}
            href={qs({ period: x.key })}
            aria-current={period === x.key ? "page" : undefined}
            className={cn(
              "flex min-h-control items-center rounded-full border px-3 text-sm font-medium",
              period === x.key
                ? "border-ink bg-ink text-surface"
                : "border-border-strong bg-surface text-ink-soft hover:bg-surface-muted",
            )}
          >
            {x.label}
          </Link>
        ))}
      </nav>

      <Panel title="Changes" titleId="history-changes" count={rows.length} flush>
        <DataTable
          id="history"
          label="Changes"
          wide
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          empty="No changes match. Edits, deletes and adjustments show up here."
          phoneRow={(r) => ({
            title: `${r.item} · ${r.what}`,
            subtitle: `${formatWhen(r.when)}${r.who ? ` · ${r.who}` : ""}${r.reason ? ` · ${r.reason}` : ""}`,
            badge: (
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="min-w-0 break-words">
                  <Value v={r.before} kind="before" /> → <Value v={r.after} kind="after" />
                </span>
                {r.restorable ? <RestoreButton id={r.id} back={back} /> : null}
              </span>
            ),
          })}
        />
      </Panel>
      <p className="text-xs text-ink-muted">
        History can&apos;t be edited or deleted. Restore writes a new line, so nothing is ever lost.
      </p>
    </div>
  );
}

function Value({ v, kind }: { v: unknown; kind: "before" | "after" }) {
  const s = show(v);
  if (s == null) return <span className="text-ink-muted">—</span>;
  return <span className={kind === "before" ? "text-ink-muted line-through" : "text-success"}>{s}</span>;
}

function RestoreButton({ id, back }: { id: number; back: string }) {
  return (
    <form action={restoreChangeAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="back" value={back} />
      <button type="submit" className={buttonClass("quiet")}>
        Restore
      </button>
    </form>
  );
}
