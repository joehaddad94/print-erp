"use client";

import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Link } from "@/components/ui/link";
import { cn } from "@/lib/cn";
import { logoutAction } from "@/server/auth/actions";
import { Icon } from "./icons";
import { MENU_ITEMS, isActive } from "./nav";

const item =
  "flex min-h-control w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-md text-rail-ink hover:bg-rail-active hover:text-rail-strong";

/**
 * Your name at the bottom of the sidebar (prototype `.userw`): opens a small menu with Settings,
 * the owner's How costs work and Change history, and Sign out. Esc or a click outside closes it.
 */
export function UserMenu({ username, owner }: { username: string; owner: boolean }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();
  const [shownFor, setShownFor] = useState(pathname);
  if (shownFor !== pathname) {
    setShownFor(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div ref={box} className="relative">
      {open ? (
        <div
          id={id}
          className="absolute inset-x-0 bottom-full z-20 mb-1.5 flex min-w-50 flex-col gap-0.5 rounded-lg bg-rail-active p-1 shadow-raised lg:rail-collapsed:right-auto"
        >
          {MENU_ITEMS.filter((i) => owner || !i.owner).map((i) => (
            <Link
              key={i.href}
              href={i.href}
              aria-current={isActive(i.href, pathname) ? "page" : undefined}
              className={cn(item, "hover:bg-rail", isActive(i.href, pathname) && "font-medium text-rail-strong")}
            >
              <Icon name={i.icon} size={16} className="shrink-0" />
              {i.label}
            </Link>
          ))}
          <form action={logoutAction}>
            <button type="submit" className={cn(item, "hover:bg-rail")}>
              <Icon name="logout" size={16} className="shrink-0" />
              Sign out
            </button>
          </form>
        </div>
      ) : null}
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        title={`${username} · Settings, history, sign out`}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-control w-full cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-rail-strong hover:bg-rail-active lg:rail-collapsed:justify-center"
      >
        <span
          aria-hidden="true"
          className="grid size-7 shrink-0 place-items-center rounded-full bg-rail-active text-xs font-semibold uppercase"
        >
          {username.slice(0, 1)}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium lg:rail-collapsed:sr-only">
          {username}
          <span className="sr-only"> · Settings, history, sign out</span>
        </span>
        <Icon name="dots" size={18} className="text-rail-muted lg:rail-collapsed:hidden" />
      </button>
    </div>
  );
}
