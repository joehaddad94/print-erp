"use client";

import { useEffect } from "react";
import { RAIL_KEY, type RailState } from "@/lib/ui/sidebar";
import { Icon } from "./icons";

function current(): RailState {
  return document.documentElement.dataset.rail === "collapsed" ? "collapsed" : "expanded";
}

function toggle() {
  const next: RailState = current() === "collapsed" ? "expanded" : "collapsed";
  document.documentElement.dataset.rail = next;
  try {
    localStorage.setItem(RAIL_KEY, next);
  } catch {
    // Private mode: the choice just isn't remembered.
  }
}

/** Collapses the desktop sidebar to icons and back. The `[` key does the same, except while typing. */
export function RailToggle() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "[" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <button
      type="button"
      onClick={toggle}
      title="Collapse or expand the sidebar ( [ )"
      className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-md text-rail-muted hover:bg-rail-active hover:text-rail-strong"
    >
      <Icon name="collapse" size={16} />
      <span className="sr-only">Collapse or expand the sidebar</span>
    </button>
  );
}
