import Link from "next/link";
import { NAV } from "@/components/shell/nav";
import { logoutAction } from "@/server/auth/actions";

/** Phone "More" tab: every screen, grouped as in the desktop sidebar. */
export default function MorePage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">More</h1>
      {NAV.map((group) => (
        <section key={group.label} aria-labelledby={`more-${group.label}`}>
          <h2 id={`more-${group.label}`} className="pb-1 text-xs font-semibold tracking-wide text-ink-muted uppercase">
            {group.label}
          </h2>
          <ul className="divide-y divide-border rounded-md border border-border bg-surface">
            {group.items.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="flex min-h-tap items-center px-3 font-semibold">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <form action={logoutAction}>
        <button
          type="submit"
          className="flex min-h-tap w-full cursor-pointer items-center rounded-md border border-border bg-surface px-3 font-semibold text-danger"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
