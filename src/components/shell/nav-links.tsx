"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Link } from "@/components/ui/link";
import { cn } from "@/lib/cn";
import { Icon } from "./icons";
import { NAV, START_PRINT, isActive, type NavItem } from "./nav";

const sideLink =
  "flex min-h-tap items-center gap-3 rounded-md px-3 text-md font-medium text-ink-soft hover:bg-surface-muted hover:text-ink";
const sideLinkOn = "bg-action-soft font-semibold text-action hover:bg-action-soft hover:text-action";

/**
 * Desktop sidebar list. Highlights the section you're in, including its detail pages.
 * `primary` (the Start print button) sits inside the nav landmark, above the list.
 */
export function SidebarNav({ primary }: { primary?: ReactNode }) {
  return <SidebarNavList primary={primary} pathname={usePathname()} />;
}

/** Same list without reading the URL: the Suspense fallback while the pathname is unknown. */
export function SidebarNavList({ primary, pathname }: { primary?: ReactNode; pathname: string }) {
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {primary}
      {NAV.map((group, gi) => (
        <div key={group.label} className="flex flex-col gap-0.5">
          {gi > 0 ? (
            <p className="px-3 pt-5 pb-1 text-xs font-semibold tracking-wide text-ink-muted uppercase">{group.label}</p>
          ) : null}
          {group.items.map((item) => (
            <SideLink key={item.href} item={item} active={isActive(item.href, pathname)} />
          ))}
        </div>
      ))}
    </nav>
  );
}

function SideLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link href={item.href} aria-current={active ? "page" : undefined} className={cn(sideLink, active && sideLinkOn)}>
      <Icon name={item.icon} size={18} className="shrink-0" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

/** Phone bottom bar: four tabs plus the Start print button in the middle. */
export function TabBar() {
  return <TabBarList pathname={usePathname()} />;
}

/** Same bar without reading the URL (Suspense fallback). */
export function TabBarList({ pathname }: { pathname: string }) {
  const tabs = NAV.flatMap((g) => g.items).filter((i) => i.phone);
  const moreActive =
    pathname === "/more" ||
    (pathname !== "" && !NAV.flatMap((g) => g.items).some((i) => i.phone && isActive(i.href, pathname)));
  const startActive = isActive(START_PRINT.href, pathname);
  const tab = (active: boolean) =>
    cn(
      "flex min-h-tap flex-col items-center justify-center gap-0.5 text-xs font-medium text-ink-muted",
      active && "font-semibold text-action",
    );
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 items-center border-t border-border bg-surface pb-safe lg:hidden"
    >
      {tabs.slice(0, 2).map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={isActive(t.href, pathname) ? "page" : undefined}
          className={tab(isActive(t.href, pathname))}
        >
          <Icon name={t.icon} size={22} />
          {t.label}
        </Link>
      ))}
      <Link
        href={START_PRINT.href}
        aria-current={startActive ? "page" : undefined}
        className="mx-auto my-1 grid size-12 place-items-center rounded-lg bg-action text-action-ink shadow-raised"
      >
        <Icon name="plus" size={24} />
        <span className="sr-only">{START_PRINT.label}</span>
      </Link>
      {tabs.slice(2).map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={isActive(t.href, pathname) ? "page" : undefined}
          className={tab(isActive(t.href, pathname))}
        >
          <Icon name={t.icon} size={22} />
          {t.label}
        </Link>
      ))}
      <Link
        href="/more"
        aria-current={pathname === "/more" ? "page" : undefined}
        className={tab(moreActive && !startActive)}
      >
        <Icon name="more" size={22} />
        More
      </Link>
    </nav>
  );
}
