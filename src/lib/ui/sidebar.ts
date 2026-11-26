/**
 * Collapsible sidebar (docs/DESIGN-SYSTEM.md §5): expanded by default at 1280px and wider,
 * collapsed at 1024 to 1279px; the person's choice is remembered per device.
 */
export const RAIL_KEY = "ps-rail";

export type RailState = "expanded" | "collapsed";

export function initialRail(stored: string | null, viewportWidth: number): RailState {
  if (stored === "expanded" || stored === "collapsed") return stored;
  return viewportWidth >= 1280 ? "expanded" : "collapsed";
}

/**
 * Runs in <head> before paint so the page never flashes the wrong width.
 * Kept as a string built from the same rules as initialRail.
 */
export const railBootScript = `try{var s=localStorage.getItem(${JSON.stringify(RAIL_KEY)});document.documentElement.dataset.rail=s==="expanded"||s==="collapsed"?s:(innerWidth>=1280?"expanded":"collapsed")}catch(e){document.documentElement.dataset.rail=innerWidth>=1280?"expanded":"collapsed"}`;
