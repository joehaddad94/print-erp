import { Suspense, type ReactNode } from "react";
import { Link } from "@/components/ui/link";
import { logoutAction } from "@/server/auth/actions";
import { currentUser } from "@/server/auth/session";
import { Icon } from "./icons";
import { LivePrintCard, LivePrintStrip } from "./live-print";
import { START_PRINT } from "./nav";
import { OwnerSideLinks, SidebarNav, SidebarNavList, TabBar, TabBarList } from "./nav-links";
import { RailToggle } from "./rail-toggle";

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
    <div className="min-h-dvh lg:pl-sidebar lg:rail-collapsed:pl-rail">
      <aside
        aria-label="Sidebar"
        className="fixed inset-y-0 left-0 hidden w-sidebar flex-col bg-rail text-rail-ink lg:flex lg:rail-collapsed:w-rail"
      >
        <div className="flex items-center gap-2.5 px-5 pt-4 pb-3 lg:rail-collapsed:flex-col lg:rail-collapsed:px-2.5">
          <Brand />
          <RailToggle />
        </div>
        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-2.5 pb-3">
          <Suspense fallback={<SidebarNavList primary={<StartPrintButton />} pathname="" />}>
            <SidebarNav
              primary={
                <>
                  <StartPrintButton />
                  <Suspense fallback={null}>
                    <LivePrintCard />
                  </Suspense>
                </>
              }
              ownerSlot={
                <Suspense fallback={null}>
                  <OwnerNav />
                </Suspense>
              }
            />
          </Suspense>
        </div>
        <div className="border-t border-rail-border px-2.5 py-2">
          <Suspense fallback={<UserBadgeSkeleton />}>
            <UserBadge />
          </Suspense>
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center justify-between bg-rail px-4 lg:hidden">
        <Link href="/" className="flex min-h-control items-center gap-2.5">
          <Brand />
        </Link>
      </header>

      <main id="content" className="w-full max-w-page min-w-0 px-4 pt-5 pb-28 sm:px-6 lg:px-8 lg:pt-6 lg:pb-12">
        {children}
      </main>

      <Suspense fallback={null}>
        <LivePrintStrip />
      </Suspense>
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
      title={START_PRINT.label}
      className="mb-2 flex min-h-control items-center justify-center gap-1.5 rounded-md bg-action px-3 font-medium text-action-ink hover:bg-action-hover"
    >
      <Icon name="plus" size={16} />
      <span className="lg:rail-collapsed:sr-only">{START_PRINT.label}</span>
    </Link>
  );
}

function Brand() {
  return (
    <>
      <span className="grid size-7 place-items-center rounded-md bg-action text-action-ink">
        <Icon name="machines" size={16} />
      </span>
      <span className="flex-1 text-md font-semibold text-rail-strong lg:rail-collapsed:sr-only">Print Shop</span>
    </>
  );
}

async function OwnerNav() {
  const user = await currentUser();
  return user?.role === "owner" ? <OwnerSideLinks /> : null;
}

async function UserBadge() {
  const user = await currentUser();
  if (!user) return null;
  return (
    <div className="flex items-center gap-2.5 px-2 lg:rail-collapsed:justify-center">
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-rail-active text-xs font-semibold text-rail-strong uppercase">
        {user.username.slice(0, 1)}
      </span>
      <p className="min-w-0 flex-1 truncate text-sm font-medium text-rail-strong lg:rail-collapsed:sr-only">
        {user.username}
      </p>
      <form action={logoutAction} className="lg:rail-collapsed:hidden">
        <button
          type="submit"
          className="flex min-h-control cursor-pointer items-center gap-1.5 rounded-md px-2 text-sm font-medium text-rail-ink hover:bg-rail-active hover:text-rail-strong"
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
    <div className="flex min-h-control items-center gap-3 px-2" aria-hidden="true">
      <span className="size-7 animate-shimmer rounded-full bg-rail-active" />
      <span className="h-3 w-20 animate-shimmer rounded-sm bg-rail-active" />
    </div>
  );
}
