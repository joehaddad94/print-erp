import type { IconName } from "./icons";

/**
 * One navigation model for both layouts.
 * Desktop: sidebar groups. Phone: the `phone` items as bottom tabs, the rest under "More".
 * "Start print" is the primary action (sidebar button, phone centre +), not a list item.
 */
/** `owner`: only shown to owners (R1); the screen itself also refuses staff. */
export type NavItem = {
  href: string;
  label: string;
  icon: IconName;
  milestone: string;
  phone?: boolean;
  owner?: boolean;
};
export type NavGroup = { label: string; items: NavItem[] };

export const START_PRINT = { href: "/print", label: "Start print" } as const;

export const NAV: NavGroup[] = [
  {
    label: "Work",
    items: [
      { href: "/", label: "Today", icon: "home", milestone: "M4", phone: true },
      { href: "/orders", label: "Orders", icon: "orders", milestone: "M5", phone: true },
      { href: "/customers", label: "Customers", icon: "customers", milestone: "M5" },
      { href: "/calculator", label: "Cost calculator", icon: "calculator", milestone: "M3" },
    ],
  },
  {
    label: "Catalogue",
    items: [
      { href: "/products", label: "Products", icon: "products", milestone: "M3" },
      { href: "/recipes", label: "Recipes", icon: "recipes", milestone: "M3" },
      { href: "/stock", label: "Stock", icon: "stock", milestone: "M6", phone: true },
      { href: "/assemble", label: "Assemble", icon: "assemble", milestone: "M6" },
      { href: "/machines", label: "Machines", icon: "machines", milestone: "M2" },
    ],
  },
  {
    label: "Money",
    items: [
      { href: "/purchases", label: "Purchases", icon: "stock", milestone: "R7" },
      { href: "/expenses", label: "Expenses", icon: "expenses", milestone: "M2" },
      { href: "/suppliers", label: "Suppliers", icon: "suppliers", milestone: "M2" },
    ],
  },
  {
    label: "Account",
    items: [
      { href: "/settings", label: "Settings", icon: "settings", milestone: "M2" },
      { href: "/costs", label: "How costs work", icon: "info", milestone: "R9", owner: true },
      { href: "/history", label: "Change history", icon: "history", milestone: "M6", owner: true },
    ],
  },
];

export const ALL_ITEMS = NAV.flatMap((g) => g.items);
export const findSection = (slug: string) => ALL_ITEMS.find((i) => i.href === `/${slug}`);

/** Which nav item a path belongs to: "/" only matches itself; "/orders/12" matches "/orders". */
export function isActive(href: string, pathname: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
