import { Link } from "@/components/ui/link";
import { db } from "@/db";
import { currentUser } from "@/server/auth/session";
import { runningJobs } from "@/server/printing/service";

/** Progress of a running print from its G-code estimate (null when the file had none). */
function progress(j: { startedAt: Date; estimatedSeconds: number | null }, now: number) {
  if (!j.estimatedSeconds) return { pct: null, minutesLeft: null };
  const elapsed = (now - j.startedAt.getTime()) / 1000;
  return {
    pct: Math.min(100, Math.max(0, Math.round((elapsed / j.estimatedSeconds) * 100))),
    minutesLeft: Math.max(0, Math.ceil((j.estimatedSeconds - elapsed) / 60)),
  };
}

async function running() {
  if (!(await currentUser())) return null;
  const [job] = await runningJobs(db());
  // A server render's clock is the request time: that is what the progress shows.
  return job ? { job, ...progress(job, Date.now()) } : null;
}

/** Sidebar card under Start print while something prints (docs/DESIGN-SYSTEM.md §5). */
export async function LivePrintCard() {
  const r = await running();
  if (!r) return null;
  const { job, pct, minutesLeft } = r;
  return (
    <div className="mb-2 rounded-md bg-rail-active p-2.5 text-sm lg:rail-collapsed:p-1.5">
      <div className="flex items-center gap-2 lg:rail-collapsed:hidden">
        <span aria-hidden="true" className="size-2 shrink-0 animate-shimmer rounded-full bg-rail-accent" />
        <span className="flex-1 font-medium text-rail-strong">Printing{pct != null ? ` · ${pct}%` : ""}</span>
        <Link
          href={`/print/${job.id}`}
          className="inline-flex min-h-6 items-center font-medium text-rail-accent hover:underline"
        >
          Finish
        </Link>
      </div>
      {pct != null ? (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-rail lg:rail-collapsed:mt-0" aria-hidden="true">
          <div className="h-full rounded-full bg-rail-accent" style={{ width: `${pct}%` }} />
        </div>
      ) : null}
      <p className="mt-1.5 truncate text-xs text-rail-ink lg:rail-collapsed:sr-only">
        {job.recipeName}
        {minutesLeft != null ? ` · ${minutesLeft} min left` : ""}
      </p>
    </div>
  );
}

/** Phone: a strip just above the tab bar while something prints. */
export async function LivePrintStrip() {
  const r = await running();
  if (!r) return null;
  const { job, pct } = r;
  return (
    <div className="fixed inset-x-0 bottom-14 z-30 flex h-10 items-center gap-3 border-b border-rail-border bg-rail px-4 text-sm lg:hidden">
      <span aria-hidden="true" className="size-2 shrink-0 animate-shimmer rounded-full bg-rail-accent" />
      <span className="font-medium text-rail-strong">Printing{pct != null ? ` ${pct}%` : ""}</span>
      {pct != null ? (
        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-rail-active" aria-hidden="true">
          <span className="block h-full rounded-full bg-rail-accent" style={{ width: `${pct}%` }} />
        </span>
      ) : (
        <span className="flex-1 truncate text-rail-ink">{job.recipeName}</span>
      )}
      <Link
        href={`/print/${job.id}`}
        className="inline-flex min-h-tap min-w-tap items-center justify-center px-2 font-medium text-rail-accent"
      >
        Finish
      </Link>
    </div>
  );
}
