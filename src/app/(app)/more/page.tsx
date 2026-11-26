import { Icon } from "@/components/shell/icons";
import { NAV } from "@/components/shell/nav";
import { PageHeader } from "@/components/ui";
import { Link } from "@/components/ui/link";
import { logoutAction } from "@/server/auth/actions";
import { isOwner, requireUser } from "@/server/auth/session";

/** Phone "More" tab: every screen, grouped as in the desktop sidebar. */
export default async function MorePage() {
  const owner = isOwner(await requireUser());
  return (
    <div className="flex max-w-content flex-col gap-6">
      <PageHeader title="More" />
      {NAV.map((group) => (
        <section key={group.label} aria-labelledby={`more-${group.label}`} className="flex flex-col gap-2">
          <h2 id={`more-${group.label}`} className="text-xs font-semibold tracking-wide text-ink-muted uppercase">
            {group.label}
          </h2>
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
            {group.items
              .filter((item) => owner || !item.owner)
              .map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="flex min-h-control items-center gap-3 px-4 py-2.5 font-medium hover:bg-surface-muted"
                  >
                    <Icon name={item.icon} size={20} className="shrink-0 text-ink-muted" />
                    <span className="flex-1">{item.label}</span>
                    <Icon name="chevron" size={18} className="text-ink-muted" />
                  </Link>
                </li>
              ))}
          </ul>
        </section>
      ))}
      <form action={logoutAction}>
        <button
          type="submit"
          className="flex min-h-control w-full cursor-pointer items-center gap-3 rounded-lg border border-border bg-surface px-4 font-semibold text-danger hover:bg-danger-bg"
        >
          <Icon name="logout" size={20} />
          Sign out
        </button>
      </form>
    </div>
  );
}
