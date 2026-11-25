import { Suspense, type ReactNode } from "react";
import { Link } from "@/components/ui/link";
import { logoutAction } from "@/server/auth/actions";
import { currentUser } from "@/server/auth/session";
import { Icon } from "./icons";
import { START_PRINT } from "./nav";
import { SidebarNav, SidebarNavList, TabBar, TabBarList } from "./nav-links";

/**
 * App shell. Desktop (≥1024px): fixed left sidebar. Phone: top bar + bottom tabs.
 *
 * The shell is static: it renders before any database call, so it is part of
 * the prefetched App Shell and every click shows the next screen's skeleton
 * at once. Only the user's name streams in (UserBadge, in its own Suspense).
 * Content is left-aligned; each screen picks its own max width.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh lg:pl-sidebar">
      <aside
        aria-label="Sidebar"
        className="fixed inset-y-0 left-0 hidden w-sidebar flex-col border-r border-border bg-surface lg:flex"
      >
        <div className="flex items-center gap-2.5 px-5 pt-5 pb-4">
          <Brand />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
          <Suspense fallback={<SidebarNavList primary={<StartPrintButton />} pathname="" />}>
            <SidebarNav primary={<StartPrintButton />} />
          </Suspense>
        </div>
        <div className="border-t border-border p-3">
          <Suspense fallback={<UserBadgeSkeleton />}>
            <UserBadge />
          </Suspense>
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-surface px-4 lg:hidden">
        <Link href="/" className="flex min-h-tap items-center gap-2.5">
          <Brand />
        </Link>
      </header>

      <main id="content" className="w-full max-w-page min-w-0 px-4 pt-5 pb-28 sm:px-6 lg:px-10 lg:pt-8 lg:pb-12">
        {children}
      </main>

      <Suspense fallback={<TabBarList pathname="" />}>
        <TabBar />
      </Suspense>
    </div>
  );
}

function StartPrintButton() {
  return (
    <Link
      href={START_PRINT.href}
      className="mb-3 flex min-h-tap items-center justify-center gap-2 rounded-md bg-action px-4 font-semibold text-action-ink transition-colors hover:bg-action-hover"
    >
      <Icon name="plus" size={18} />
      {START_PRINT.label}
    </Link>
  );
}

function Brand() {
  return (
    <>
      <span className="grid size-7 place-items-center rounded-md bg-action text-action-ink">
        <Icon name="machines" size={16} />
      </span>
      <span className="text-md font-bold text-ink">Print Shop</span>
    </>
  );
}

async function UserBadge() {
  const user = await currentUser();
  if (!user) return null;
  return (
    <div className="flex items-center gap-3 px-2">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-muted text-sm font-semibold text-ink-soft uppercase">
        {user.username.slice(0, 1)}
      </span>
      <p className="min-w-0 flex-1 truncate text-sm font-semibold">{user.username}</p>
      <form action={logoutAction}>
        <button
          type="submit"
          className="flex min-h-tap cursor-pointer items-center gap-1.5 rounded-md px-2 text-sm font-medium text-ink-muted hover:bg-surface-muted hover:text-ink"
        >
          <Icon name="logout" size={16} />
          Sign out
        </button>
      </form>
    </div>
  );
}

function UserBadgeSkeleton() {
  return (
    <div className="flex min-h-tap items-center gap-3 px-2" aria-hidden="true">
      <span className="size-8 animate-shimmer rounded-full bg-skeleton" />
      <span className="h-3 w-20 animate-shimmer rounded-sm bg-skeleton" />
    </div>
  );
}
