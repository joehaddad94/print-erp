# Design system: "Workshop"

Agreed with Joe on 26 Nov 2026. It replaces the v0.8 "calm" look from PR 14. Every screen follows this file. If a screen needs something that is not described here, add it here first, then build it.

Reference preview: `/mnt/project-files/3d-printing/design-directions/direction-C.png` (direction C).

## 1. What it fixes

| Problem Joe saw                          | Rule that fixes it                                                                                              |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Oversized, spread out                    | 14px body text. 36px controls on desktop (44px on touch). Content fills the width up to 1200px.                 |
| No hierarchy                             | Fixed type scale (section 3). Only page titles and key numbers are large. Labels are medium weight, not bold. |
| Generic                                  | Dark sidebar, warm neutrals, one teal brand colour, one highlighted number per dashboard.                      |
| Sloppy bits (duplicate CTA, overflow)    | One primary button per screen. The sidebar fits at 768px height without scrolling. No dashed boxes.            |

## 2. Colour

There is one accent: **teal**. It is used for the primary action, the active nav item, links, progress, and at most one featured tile per screen. Everything else is neutral. Status colours (green, amber, red) appear only in badges and callouts.

| Token (Tailwind name) | Light     | Dark      | Use                                     |
| --------------------- | --------- | --------- | --------------------------------------- |
| `bg`                  | `#f4f4f2` | `#121416` | Page background (warm off-white)        |
| `surface`             | `#ffffff` | `#1a1d20` | Cards, tables, inputs                   |
| `surface-muted`       | `#efeeeb` | `#22262a` | Table header, hover, segmented track    |
| `ink`                 | `#1c1917` | `#ecebe8` | Main text                               |
| `ink-soft`            | `#44403c` | `#c9c6c1` | Secondary text in rows                  |
| `ink-muted`           | `#5f5a55` | `#9c9893` | Labels, meta, captions                  |
| `border`              | `#e7e5e2` | `#2a2e33` | Card and row dividers                   |
| `border-strong`       | `#8f8984` | `#6b6f75` | Input and secondary-button outlines (≥3:1) |
| `action`              | `#0f766e` | `#2dd4bf` | Primary button, links, active state     |
| `action-hover`        | `#115e59` | `#5eead4` |                                         |
| `action-ink`          | `#ffffff` | `#042f2e` | Text on `action`                        |
| `action-soft`         | `#e6f4f2` | `#123532` | Selected rows, soft highlights          |
| `rail`                | `#1c1f22` | `#0c0d0f` | Sidebar, phone top bar, phone tab bar   |
| `rail-ink`            | `#c9cdd1` | `#c9cdd1` | Nav text on the rail                    |
| `rail-muted`          | `#8b9298` | `#8b9298` | Group labels, icons on the rail         |
| `rail-active`         | `#2c3136` | `#22262a` | Active nav item background              |
| `rail-accent`         | `#5eead4` | `#5eead4` | Active tab on the phone bar             |

Status tones keep the existing names (`success`, `warning`, `danger`, `info`, `neutral`, each with `-bg`) and are retuned to the warm palette. Every text and background pair is checked for WCAG AA by `tests/unit/contrast.test.ts`, and that test must pass.

## 3. Type

The font is **Inter**, self-hosted with `next/font`, with tabular numbers wherever money or quantities appear.

| Token       | Size / weight   | Use                                           |
| ----------- | --------------- | --------------------------------------------- |
| `text-xs`   | 12px / 500      | Badges, table headers, captions               |
| `text-sm`   | 13px / 400–500  | Labels, meta lines, hints, nav group labels   |
| `text-md`   | 14px / 400      | Body, table cells, nav items, buttons (500)   |
| `text-lg`   | 15px / 600      | Card and section titles                       |
| `text-xl`   | 24px / 700      | Page title (one per screen)                   |
| `text-2xl`  | 26px / 600      | Key numbers in stat tiles                     |

Rules:

- Bold (700) is only for page titles. Labels use medium (500).
- Money is never bold in tables. It's bold only in totals and stat tiles.
- Phone inputs use 16px text, so iOS doesn't zoom in.

## 4. Size and spacing

- Spacing uses a 4px grid. Cards use 16px padding, and the gaps between cards are 20px.
- **Controls:** `--control-h` is 36px on desktop with a fine pointer, and 44px on touch devices and below 1024px. Phone primary buttons are 48px. Joe agreed to this on 26 Nov.
- **Rows:** table rows are 42px on desktop, and list rows on phone are at least 52px.
- **Radius:** 6px for badges, 8px for controls, 10px for cards.
- **Shadow:** cards get a 1px border and almost no shadow. Only overlays such as menus and sheets use `shadow-overlay`.
- **Widths:** pages go up to 1200px. Forms stay in one column of up to 640px, and on desktop a form may have a summary panel of 320px on its right.

## 5. Layout

**Desktop (1024px and wider): sidebar "B, collapsible"** (Joe, 26 Nov)

- Dark rail with: brand and collapse button, the Start print button, then a **live print card** (progress, time left, Finish) while something prints.
- Groups: Work (Today, Orders, Customers), Catalogue (Products, Recipes, Stock, Machines), Money (Expenses, Suppliers), then **Tools** folded (Cost calculator, Weigh filament, Assemble).
- **Badges only when something needs you:** "N due" on Orders, and an amber dot on Stock when filament is low. No permanent counts.
- The user menu at the bottom holds Settings, Change history and Sign out.
- **Collapsible to a 64px icon rail:** labels show on hover, the live print becomes a progress ring, badges become dots, and Tools opens as a fly-out. It's expanded by default at 1280px and wider, and collapsed at 1024 to 1279px. The toggle button and the `[` key switch it, and the choice is remembered on each device.
- Start print is the one global action. No screen repeats it in its own header.
- The page header has the title, a one-line description or date, then on the right: at most one primary button plus secondary buttons.

**Phone**

- The top bar is dark and shows the screen title. Detail and form screens show a close or back button there instead of the brand.
- The bottom tab bar is dark: Today, Orders, a teal Start print button, Stock, More. While something prints, a "Printing 62% · Finish" strip sits just above it.
- On form screens, the save button is pinned above the tab bar.

**Screen patterns** (every screen is one of these):

1. **Dashboard** (Today, a quick look and act page): it must fit one screen on a 1366×768 laptop, with no scrolling. Order: a compact 4-number strip, then a **Needs you** list where each row is the item, the reason, and the one button that clears it (Start print, Deliver, Record payment, Buy, Confirm), then a short **Due this week** list on the right. History such as recent prints doesn't go on Today.
2. **List** (Orders, Stock, Recipes…): page header, filter row, then a table on desktop or a list of rows on phone.
3. **Detail** (an order, a recipe…): header with a status badge and actions, then a main column of cards plus a 320px summary panel on the right on desktop (below it on phone).
4. **Form** (Start print, Add expense…): fields grouped into cards with a small group title. One column. A sticky save bar on phone.

## 6. Components (`src/components/ui`)

| Component        | Rules                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------ |
| `Button`         | `primary` (teal, one per screen), `secondary` (outlined), `quiet` (text only), `danger` (red outline). Icon optional, 15px. |
| `Field` + inputs | The label sits above (13px, weight 500), with the hint or error below. Teal focus ring. Optional fields say "(optional)" in muted text. |
| `SearchPicker`   | For any list that can grow (recipes, products, customers, suppliers, filament). A search field that opens a list of rich rows (name, version and key facts), with "Recently used" first and then A to Z. It matches the name, product and material. The chosen item shows as a card with a Change button. Keyboard support: arrows and Enter. Filament lists the material that matches the file first, shows grams left and a Low badge, and can't pick out-of-stock rows. Use a plain select only for short, fixed lists of 7 options or fewer. Printers are not a picker: one active printer shows as a preselected card, a few show as radio cards with Free or Busy, and a busy printer can't be picked. |
| `Segmented`      | For 2 to 4 options, like USD/LBP or Success/Failed. Replaces a select when there are only a few options. |
| `Card`           | Optional header (title, count chip, link on the right) above a body. The body has no padding when it holds a table or list. |
| `DataTable`      | 12px muted headers, 42px rows, right-aligned numbers, truncated long text. **Never scrolls sideways on a dashboard.** Each table sits in a container query: below 760px of card width, low-priority columns (marked `lo`) hide, and below 520px the table becomes `ListRow`s, the same as on phone. Sideways scroll is a last-resort fallback only. Two-column dashboards stack to one column when the content area is under 1040px. |
| `ListRow`        | Title and meta line on the left, value and badge on the right. The whole row is tappable.                   |
| `Badge`          | A small dot plus a label, tinted by tone. The status-to-tone mapping lives in `lib/status.ts`.              |
| `StatTile`       | Label, then the number (26px), then a muted detail line. The `featured` variant (teal fill) is allowed at most once per screen. |
| `Progress`       | A 6px teal bar, used for print progress.                                                                     |
| `EmptyState`     | Plain muted text inside the card, with an optional quiet action. No dashed borders.                         |
| `Callout`        | Tinted background with a tone icon. Used for warnings and explanations, never for decoration.               |
| `Skeleton`       | Same shapes as the real content.                                                                             |

## 7. Accessibility (must pass)

- Text contrast is at least 4.5:1, and borders of controls are at least 3:1, in light and dark mode (checked by `contrast.test.ts`).
- Pointer targets are at least 24px everywhere (WCAG 2.2 AA, 2.5.8), and 44px on touch.
- Focus is always visible: a 2px teal outline.
- Status is never shown by colour alone: badges always have a label.
- Axe runs on every screen in the e2e suite.

## 8. How UI changes are approved

1. New screens and visual changes are drawn first in the HTML prototype (`/mnt/project-files/3d-printing/design-directions/prototype.html`), on desktop and phone.
2. Joe approves the rendered prototype before any code is written.
3. Every UI PR must match the approved prototype and include desktop and phone screenshots of each screen it changes.
4. Passing the checks (axe, contrast, target size) is necessary, but it is not the bar. The bar is matching the approved design.
