import Link from "next/link";
import type { ReactNode } from "react";
import { logoutAction } from "@/server/auth/actions";
import { NAV } from "./nav";

const linkClass = "flex min-h-tap items-center rounded-md px-3 text-sm font-semibold text-ink hover:bg-action-soft";

/** Phone: bottom tabs + "More". Desktop (≥1024px): sidebar with groups. Layout only; screens are the same. */
export function AppShell({ username, children }: { username: string; children: ReactNode }) {
  const phoneTabs = NAV.flatMap((g) => g.items).filter((i) => i.phone);
  return (
    <div className="min-h-dvh lg:flex">
      <aside className="hidden w-60 shrink-0 border-r border-border bg-surface p-3 lg:block" aria-label="Sidebar">
        <p className="px-3 py-2 text-lg font-bold">Print Shop</p>
        <nav aria-label="Main">
          {NAV.map((group) => (
            <div key={group.label} className="mt-3">
              <p className="px-3 py-1 text-xs font-semibold tracking-wide text-ink-muted uppercase">{group.label}</p>
              <ul>
                {group.items.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href} className={linkClass}>
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <form action={logoutAction} className="mt-6 border-t border-border pt-3">
          <p className="px-3 pb-1 text-xs text-ink-muted">Signed in as {username}</p>
          <button type="submit" className={`${linkClass} w-full cursor-pointer`}>
            Sign out
          </button>
        </form>
      </aside>

      <main className="mx-auto w-full max-w-content min-w-0 flex-1 px-4 pt-4 pb-24 lg:pb-8">{children}</main>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 grid grid-cols-5 border-t border-border bg-surface lg:hidden"
      >
        {phoneTabs.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex min-h-tap items-center justify-center px-1 text-xs font-semibold text-ink"
          >
            {item.label}
          </Link>
        ))}
        <Link href="/more" className="flex min-h-tap items-center justify-center px-1 text-xs font-semibold text-ink">
          More
        </Link>
      </nav>
    </div>
  );
}
