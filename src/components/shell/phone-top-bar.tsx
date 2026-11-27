"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Link } from "@/components/ui/link";
import { Icon } from "./icons";
import { ALL_ITEMS, START_PRINT } from "./nav";

const SCREENS = [...ALL_ITEMS, { ...START_PRINT, phone: true }];

/**
 * Where the phone top bar's back arrow goes (prototype `.ptop .back`): a detail or form goes up
 * to its list; a list that isn't a tab goes to More. Tabs, Today and More show the brand.
 */
export function phoneBack(pathname: string): { href: string; label: string } | null {
  if (pathname === "/" || pathname === "/more") return null;
  const parts = pathname.split("/").filter(Boolean);
  // A print (finish or finished) is reached from Today, like the desktop back link.
  if (parts[0] === "print" && parts.length > 1) return { href: "/", label: "Today" };
  const own = SCREENS.find((s) => s.href === pathname);
  if (own) return own.phone ? null : { href: "/more", label: "More" };
  for (let n = parts.length - 1; n > 0; n--) {
    const up = `/${parts.slice(0, n).join("/")}`;
    const s = SCREENS.find((x) => x.href === up);
    if (s) return { href: s.href, label: s.label };
  }
  return { href: "/", label: "Today" };
}

/** Phone top bar: the brand, or "‹ Parent" on screens below a tab. */
export function PhoneTopBar({ brand }: { brand: ReactNode }) {
  const back = phoneBack(usePathname());
  if (!back)
    return (
      <Link href="/" className="flex min-h-control items-center gap-2.5">
        {brand}
      </Link>
    );
  return (
    <Link
      href={back.href}
      aria-label={`Back to ${back.label}`}
      className="-ml-2 flex min-h-tap items-center gap-0.5 pr-3 text-md font-medium text-rail-strong"
    >
      <Icon name="back" size={22} />
      {back.label}
    </Link>
  );
}
