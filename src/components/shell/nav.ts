/** Navigation from mockup/erp-mockup.html: phone tabs + desktop sidebar groups. */
export type NavItem = { href: string; label: string; milestone: string; phone?: boolean };
export type NavGroup = { label: string; items: NavItem[] };

export const NAV: NavGroup[] = [
  {
    label: "Work",
    items: [
      { href: "/", label: "Today", milestone: "M4", phone: true },
      { href: "/print", label: "Start print", milestone: "M4", phone: true },
      { href: "/orders", label: "Orders", milestone: "M5", phone: true },
      { href: "/customers", label: "Customers", milestone: "M5" },
      { href: "/recipes", label: "Recipes", milestone: "M3" },
      { href: "/products", label: "Products", milestone: "M3" },
    ],
  },
  {
    label: "Inventory",
    items: [
      { href: "/stock", label: "Stock", milestone: "M6", phone: true },
      { href: "/machines", label: "Machines", milestone: "M2" },
    ],
  },
  {
    label: "Money",
    items: [
      { href: "/expenses", label: "Expenses & purchases", milestone: "M2" },
      { href: "/suppliers", label: "Suppliers", milestone: "M2" },
    ],
  },
  {
    label: "Tools",
    items: [
      { href: "/calculator", label: "Cost calculator", milestone: "M3" },
      { href: "/weigh", label: "Weigh filament", milestone: "M4" },
      { href: "/assemble", label: "Assemble", milestone: "M6" },
      { href: "/history", label: "Change history", milestone: "M6" },
      { href: "/settings", label: "Settings", milestone: "M2" },
    ],
  },
];

export const ALL_ITEMS = NAV.flatMap((g) => g.items);
export const findSection = (slug: string) => ALL_ITEMS.find((i) => i.href === `/${slug}`);
