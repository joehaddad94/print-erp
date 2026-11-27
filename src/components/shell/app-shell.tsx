import { Suspense, type ReactNode } from "react";
import { Link } from "@/components/ui/link";
import { currentUser } from "@/server/auth/session";
import { Icon } from "./icons";
import { LivePrintCard, LivePrintStrip } from "./live-print";
import { START_PRINT } from "./nav";
import { SidebarNav, SidebarNavList, TabBar, TabBarList } from "./nav-links";
import { UserMenu } from "./user-menu";
import { PhoneTopBar } from "./phone-top-bar";
import { RailToggle } from "./rail-toggle";
import { ShopName } from "./shop-name";

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
        <Suspense
          fallback={
            <Link href="/" className="flex min-h-control items-center gap-2.5">
              <Brand />
            </Link>
          }
        >
          <PhoneTopBar brand={<Brand />} />
        </Suspense>
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
      <span className="flex-1 text-md font-semibold text-rail-strong lg:rail-collapsed:sr-only">
        <Suspense fallback="Print Shop">
          <ShopName />
        </Suspense>
      </span>
    </>
  );
}

async function UserBadge() {
  const user = await currentUser();
  if (!user) return null;
  return <UserMenu username={user.username} owner={user.role === "owner"} />;
}

function UserBadgeSkeleton() {
  return (
    <div className="flex min-h-control items-center gap-3 px-2" aria-hidden="true">
      <span className="size-7 animate-shimmer rounded-full bg-rail-active" />
      <span className="h-3 w-20 animate-shimmer rounded-sm bg-rail-active" />
    </div>
  );
}
