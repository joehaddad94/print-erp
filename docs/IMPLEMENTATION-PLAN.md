# print-erp: implementation plan (v0.1)

Nov 24, 2026 · for Joe · built from spec v0.7 (D1–D46) and `mockup/` v0.7

> **Read this first.** The spec's D8 time box says real prints must be recorded within 2 weeks of starting. All 15 screens with full test coverage will not fit in 2 weeks. This plan meets D8 with milestones M0–M4: login, settings, filament purchases, G-code import, Start and Finish. Orders, payments, Assemble and the rest come after that, M5–M7. If something has to slip, it slips in that order, which is the spec's own cut line.

---

## 1. How "without my intervention" works

You never test by hand. Each milestone is one pull request. A PR can merge only when every automated check below passes on GitHub, and each check is a script, not a person.

| Gate | What it proves | Runs |
| --- | --- | --- |
| **Typecheck** (`tsc --noEmit`, strict) | No type errors anywhere | Every PR |
| **Lint** (ESLint + Tailwind rules) | Code style; no arbitrary Tailwind values such as `w-[37px]`; no raw colours outside the theme | Every PR |
| **Unit tests** (Vitest) | Cost formulas, G-code parser, Zod schemas, money and rate maths, against worked numbers in §6 | Every PR |
| **Database tests** (Vitest + real Postgres 17 in CI) | Migrations apply from empty; constraints, views and transactions behave as the spec says | Every PR |
| **End-to-end tests** (Playwright) | Each screen works in a real browser at **phone (390×844)** and **desktop (1280×800)** sizes | Every PR |
| **Accessibility** (axe-core in Playwright + our own checks) | Zero axe violations; text contrast ≥ 4.5:1; every control ≥ 44×44 px; every input has a label | Every PR |
| **Build** (`next build`) | Production build succeeds | Every PR |
| **Migration rehearsal** (throwaway Neon branch) | The new migration applies to a copy of **live data** without error | PRs that add a migration, once Neon exists |
| **Post-deploy smoke test** | Live site is up: login page loads, health check reaches the database | After every deploy to production |

**Merging.** [Certain] Nothing I read on GitHub can approve a merge, so either you press Merge on each green PR, or you tell me once in this thread "merge milestone PRs when all checks are green" and I do it. I recommend the second. You still get a short summary per milestone, and every PR stays revertible.

**Where tests run.** [Certain] Private repos on GitHub Free get $12 of Actions compute a month, which is about 2,000 minutes on the standard Linux runner at $0.006 per minute ([GitHub docs](https://docs.github.com/en/billing/concepts/product-billing/github-actions); the 2,000 figure is my division). [Likely] One full run of the gates above takes 6 to 9 minutes, so that is about 200 PR runs a month, well above what this project needs. Database tests in CI use a Postgres container on the runner, **not** your Neon database, so CI needs no secrets and can never touch live data.

---

## 2. What only you can do (about 25 minutes in total)

| # | When | What | Why I can't |
| --- | --- | --- | --- |
| J1 | **Now** | Create an **empty private** repo `print-erp` at [github.com/new](https://github.com/new): no README, no licence. If the Claude app has access to selected repos only, add this one at [Claude GitHub App](https://github.com/apps/claude/installations/select_target). | [Certain] GitHub refused my create call ("403 Resource not accessible by integration"). |
| J2 | **End of M0** (I'll ask) | In Vercel: **Add New → Project →** import `print-erp`. Then **Storage → Create → Neon** (Marketplace) and **Storage → Create → Blob**, both connected to the project. This sets `DATABASE_URL` and `BLOB_READ_WRITE_TOKEN` for you. | Needs your Vercel login and billing. |
| J3 | Same sitting as J2 | Paste three env vars I'll give you in Vercel → Settings → Environment Variables: `SESSION_SECRET` (I generate it), `INITIAL_USERNAME`, `INITIAL_PASSWORD` (you choose). On first start the app creates your user from them if no user exists. Delete the two `INITIAL_*` vars after your first login. | Your password must never pass through me or git. |
| J4 | Same sitting | In Neon: **Account → API keys → create**. Paste it and the Neon project ID as GitHub repo secrets `NEON_API_KEY` and `NEON_PROJECT_ID` (repo → Settings → Secrets → Actions). | Turns on the migration rehearsal on a throwaway copy of live data (D44). |
| J5 | Before real use (M4) | Upgrade Vercel to **Pro** (about $20/month, D7). | [Likely] Hobby is non-commercial only. |
| J6 | Whenever you can | Data entry in the app, not setup: the printer's purchase price, the electricity price per kWh in Settings, your filament purchases. Later, a plug-meter reading to replace 0.12 kW. | Real numbers only you know. |
| J7 | When you have one | One real `.gcode` with **two different products** on one plate. | The open question in the spec: the grams-per-item check (D17) is untested on a real file. |

Nothing else needs you: no local install, no terminal, no manual testing.

---

## 3. Architecture decisions this plan locks in

These follow from the spec and the stack. None changes a business rule.

1. **Folders**
   ```text
   src/app/(auth)/login         public pages
   src/app/(app)/...            every signed-in screen; layout checks the session
   src/components/ui/           Button, Field, Select, Badge, Money, Card, Callout, Segmented, Stepper, ListRow, DataTable, Sheet, EditedMarker, EmptyState
   src/components/<feature>/    screen-specific pieces (recipes/, prints/, orders/ …)
   src/lib/gcode/               parser: plain TS, no Node or DOM APIs; runs in browser and server
   src/lib/cost/                cost formulas: pure functions, no database
   src/lib/money/               amounts, currencies, rate_to_usd, rounding
   src/lib/auth/                argon2id, signed session cookie, login throttle
   src/lib/edits/               the D13 edit engine (diff, edit_log rows, soft delete)
   src/server/<feature>/        Server Actions + database queries per feature
   src/db/schema/               Drizzle tables, one file per area; src/db/views.ts
   drizzle/                     generated SQL migrations (committed, never edited after merge)
   tests/{unit,db,e2e}/         plus tests/fixtures/*.gcode.gz
   ```
   Rule from D6: business logic lives in `lib/` or SQL views, never in components.
2. **Tailwind v4, tokens in the theme.** `src/styles/tokens.css` holds the design system's two tiers (raw palette, then semantic tokens, with dark-mode values). `globals.css` maps only the **semantic** tokens into Tailwind with `@theme`, after clearing Tailwind's default colours, radii and font sizes. So `bg-surface`, `text-ink-muted`, `bg-tone-danger-bg`, `rounded-md`, `text-sm` and `min-h-tap` exist, and `bg-red-500` or `text-[13px]` do not. A lint rule fails the PR on any `-[…]` arbitrary value. Prettier sorts class names. Components get their variants from one typed map each, so a screen writes `<Button tone="danger">`, never a pile of classes.
3. **Zod on every form.** One schema per form in `src/server/<feature>/schema.ts`, used by the Server Action (authoritative) and by the form for inline errors. A failed save returns the field errors and the typed values, so nothing is lost (D41).
4. **Money.** `numeric` columns, never floats in the database. In TypeScript, money maths happens in integer micro-dollars or with a decimal helper in `lib/money`, and rounds only for display. Each money row stores amount, currency (`USD` or `LBP`) and `rate_to_usd` (D4, D43).
5. **IDs.** Integer identity IDs, so you see "Order #42", not a UUID. `recipe_group` is a UUID.
6. **Sessions (D42).** Stateless cookie, HMAC-SHA256-signed with `SESSION_SECRET`, httpOnly, secure, SameSite=Lax, 30 days. It carries a fingerprint of the password hash, so changing the password signs out every other device. A `requireUser()` call starts every Server Action and every signed-in layout. `proxy.ts` (Next 16's renamed middleware) only redirects requests with no cookie, as a fast path, never as the security check. Wrong passwords are throttled through two columns on `users` (failed count, last failed time): after 5 failures, each try waits 30 s, doubling up to 15 min. Unknown usernames take the same time as wrong passwords.
7. **G-code reading (finding from your files).** [Certain] The object lines are **not** in the first 40 KB. In the croix file the first layer runs from byte 55,811 to 589,535 and its four objects start at bytes 55,971 to 326,484. The parser therefore reads the first 40 KB (header), the last 64 KB (totals and config) and streams up to the second `;LAYER_CHANGE` for objects, falling back to the whole file. On a 6 MB file in a phone browser that is [Likely] well under a second. Two more facts the importer must handle: the padel holder's object is named `model%2Fab6025…eb.stl` (a hash, so the importer shows "Object 1" and lets you name it), and the croix file has four object IDs for one STL, which means four pieces of one item.
8. **Blob behind an interface.** `lib/storage` has a Vercel Blob adapter for production and an in-memory adapter for tests, so CI never needs Blob credentials.
9. **Edits (D13) as one engine.** Every editable entity declares which fields are logged. One helper writes the row update, the matching `edit_log` rows and any linked stock movement updates **in one transaction**. Built once in M2, reused by every screen.
10. **Weighted average cost (D23, D38).** [Likely] A plain SQL view cannot compute a moving weighted average after stock goes out. Each `+` stock movement therefore stores the item's average cost after it (`avg_unit_cost_after_usd`), computed in `lib/cost` in the same transaction. An edit to a past movement replays the averages from that point. The `stock_average_cost` view then reads the latest value. This adds one column to the spec's `stock_movements`.

---

## 4. Milestones

Each milestone is one PR (M0 may be two). **Exit criterion = every gate in §1 is green, plus the milestone's own tests listed below.** Test IDs (e.g. `P-03`) match the test names in the code, so a failing check points straight at its line here.

### M0. Foundations: scaffold, tooling, theme, schema, login

**Builds**
- Next.js 16 (App Router, TypeScript strict, Server Actions), pnpm, ESLint, Prettier, Vitest, Playwright, GitHub Actions CI with every gate in §1.
- Tailwind theme from `design-system.html`; UI kit in `components/ui` (the 14 components in §3.1) with a dev-only `/dev/ui` page that renders every variant in light and dark. This page is what the accessibility tests scan.
- Migration `0001`: all **21 tables** with `id, created_at, updated_at, deleted_at, notes, extra` (rule 5), enums, foreign keys, check constraints, the D34 partial unique index, and the views that are pure sums: `stock_on_hand`, `stock_available`, `order_balance`, `order_shortfall`. The three cost views (`stock_average_cost`, `cost_per_good_unit`, `profit_per_hour`) come in M1 and M4, when their formulas are tested.
- Seed (idempotent): Ender-3 V3 SE machine (0.12 kW, 3,000 h, 0.4 mm, 220×220 mm, purchase cost empty until you enter it), settings `failure_allowance_pct = 12`, `failure_actual_after_prints = 20`, `recipe_grams_tolerance = {g: 2, pct: 2}`. No electricity price (you enter it, spec §v0.1 build step 4).
- Login, logout, `requireUser()`, throttle, first-user creation from `INITIAL_*` env vars, `/api/health` (checks the database with `select 1`).
- App shell: phone bottom nav and desktop sidebar from the mockup, with empty placeholder screens.

**Tests**
| ID | Test | Kind |
| --- | --- | --- |
| F-01 | Migrations apply to an empty Postgres 17, then `drizzle-kit check` reports no drift between schema files and SQL | db |
| F-02 | Exactly 21 tables exist; each has the six common columns | db |
| F-03 | D34: a second unfinished print job on the same machine is rejected by the database; it is allowed once the first has `finished_at` or is soft-deleted | db |
| F-04 | Check constraints: a part with a sale price is rejected; currency other than USD/LBP is rejected; `rate_to_usd ≤ 0` is rejected | db |
| F-05 | Seed run twice leaves one machine and one row per setting | db |
| F-06 | Views on hand-made rows: 1,000 g in, 29.22 g out → `stock_on_hand` = 970.78; 3 reserved of 5 → `stock_available` = 2 | db |
| A-01 | argon2id hash round-trip; wrong password fails | unit |
| A-02 | Session cookie: valid token accepted; tampered, expired, or wrong-secret token rejected | unit |
| A-03 | Password change invalidates old sessions | unit + db |
| A-04 | Throttle: 5 failures, the 6th try within 30 s is refused without checking the password; wait doubles; success resets | db |
| A-05 | Every Server Action module calls `requireUser()` first (a test imports every action file and fails if one doesn't) | unit |
| A-06 | e2e: signed-out visit to any app URL redirects to `/login`; good login lands on Today; logout returns to `/login` and the old cookie no longer works | e2e |
| A-07 | e2e: wrong password shows one generic error ("Wrong username or password") and keeps the username typed | e2e |
| A-08 | First start with `INITIAL_*` set and an empty `users` table creates exactly one user; with a user present it does nothing | db |
| U-01 | axe: zero violations on `/login` and `/dev/ui`, light and dark, both viewports | a11y |
| U-02 | Contrast script: every text and background token pair used by a component ≥ 4.5:1 (≥ 3:1 for large text and icons), light and dark | a11y |
| U-03 | Tap targets: every button, link, input, select and checkbox on `/dev/ui` and `/login` is ≥ 44×44 px, at both viewports | a11y |
| U-04 | No horizontal scroll at 390 px on any page | e2e |
| U-05 | Lint fixture: a file with `className="w-[37px] bg-red-500"` fails lint (proves the rule works) | unit |

**Exit:** CI green; you can log in on the live URL (after J2 and J3).

### M1. Engines with no screens: G-code parser and cost formulas

Built first because every later screen depends on them, and they are pure functions, so they can be tested to the cent.

**Builds:** `lib/gcode` (interface `GcodeParser`, `creality_print_gcode` v1, `readGcodeFile(blob)` for browser and server), `lib/cost` (job cost, shares, unit cost under both failure methods, waste, weighted average, profit per hour), `lib/money`. Views `stock_average_cost` and the `avg_unit_cost_after_usd` column (§3.10).

**Parser tests** (fixtures stored gzipped in `tests/fixtures/`, about 1.5 MB together)
| ID | Test |
| --- | --- |
| P-01 | Padel holder: slicer `Creality_Print`, version `7.3.2.6412`, printer `Creality Ender-3 V3 SE`, nozzle 0.4, PLA, colour `#00FF80`, layer height 0.20, 180 layers |
| P-02 | Padel holder totals from the **end of file**: 29.22 g, 9,797.72 mm, 23.57 cm³, estimated 6,450.35 s (from `;TIME`), text estimate `1h 47m 30s` = 6,450 s |
| P-03 | End-of-file mm wins over header metres (9,797.72 mm, not 9.76652 m) |
| P-04 | Temperatures 190 °C nozzle, 50 °C bed; infill 15%, walls 2, supports tree(auto) |
| P-05 | Padel objects: 1 item, count 1, display name "Object 1", raw name kept |
| P-06 | Croix: 8.47 g, 2,839.67 mm, 6.83 cm³, 4,094.37 s, 13 layers, colour `#FFFFFF`, supports none |
| P-07 | Croix objects: **one item × 4** (four IDs, same STL), grams per piece 2.1175 → shown 2.12, no typing needed |
| P-08 | Both files: 300×300 thumbnail extracted and is a valid PNG (decodes, 300×300) |
| P-09 | `filament_cost` is read into `raw_header` but never used in cost (D40.4) |
| P-10 | `raw_header` contains every `key = value` of the header and config blocks |
| P-11 | Browser path and server path give identical results (same function, two readers) |
| P-12 | Error cases: empty file, non-G-code text, G-code from an unknown slicer → clear "not a Creality Print file" error, never a crash |
| P-13 | Performance: parsing the 6.3 MB croix file finishes in < 1.5 s on the CI runner (guards against reading every move) |
| P-14 | D17 check: plate items whose qty × grams sum within max(2 g, 2%) of the total pass; just outside fails |

**Cost tests (worked numbers).** Shared assumptions, written in the test file: filament $17.50/kg ($0.0175/g, the spec's own example), electricity $0.64/kWh (your example), power 0.12 kW (D39), machine $200 ÷ 3,000 h = $0.066667/h (**test value only**: your real printer price is not in the spec yet). Expected values rounded to 5 decimals; tests compare at full precision with a 1e-9 tolerance.

| ID | Case | Expected |
| --- | --- | --- |
| C-01 | Padel holder, 29.22 g, 6,450.35 s (1.79176 h) | filament 0.51135 · electricity 0.13761 · wear 0.11945 · **job 0.76841** |
| C-02 | Padel, allowance method (12%), 1 planned, 1 good | unit cost **0.87319** = 0.76841 ÷ (1 × 0.88) |
| C-03 | Padel, actual method, 1 good | unit cost **0.76841** |
| C-04 | Croix, 8.47 g, 4,094.37 s (1.13732 h) | filament 0.14823 · electricity 0.08735 · wear 0.07582 · **job 0.31139** |
| C-05 | Croix, allowance, 4 planned | unit **0.08846** = 0.31139 ÷ (4 × 0.88) |
| C-06 | Croix, actual, 3 good of 4 | unit **0.10380**; waste cost **0.07785** (share × 1 ÷ 4), reported, not charged twice |
| C-07 | Croix, 0 good | nothing to stock; waste = whole share 0.31139 |
| C-08 | Split by grams: item A 2 × 10 g, item B 1 × 5 g, job $1.00 | share A **0.80**, B **0.20** |
| C-09 | Method switch: 19 finished prints → allowance; the 20th and later → actual (`failure_actual_after_prints`) | method stored on the job |
| C-10 | Recipe override `waste_allowance_pct_override = 20` → divides by 0.80, not 0.88 | |
| C-11 | Stopped at 60% → grams × 0.6 (unless weighed) | |
| C-12 | Weighted average (D23): 1,000 g at $17 + 1,000 g at $18 → **$0.0175/g** | |
| C-13 | Average after use: 500 g left at $0.0175, buy 1,000 g at $0.020 → **$0.0191667/g** | |
| C-14 | Missing electricity price or machine power → result is "incomplete" with the missing input named, never a number (spec step 4) | |
| C-15 | LBP expense: 1,790,000 LBP at 89,500 LBP/USD → $20.00; `rate_to_usd` stored = 1 ÷ 89,500 | |
| C-16 | Profit per hour (D24): price $5, cost $0.87319, packaging $0.30, 15 labour minutes → $15.31/h; missing minutes → empty, shown "—" | |
| C-17 | Property tests (fast-check): shares always sum to the job cost; unit cost never negative; average cost stays between the lowest and highest purchase price | |

**Exit:** all P and C tests green. These numbers become the source of truth for every later screen test.

### M2. Settings, machines, suppliers, Add expense / purchase, Edit engine

**Builds:** Settings screen (dated values, history list), Machines (list, edit, hours used vs life), Suppliers (list, page, total spent), Add expense with purchase side-effects (filament purchase adds grams at its price and updates the average; packaging purchase adds pieces; machine purchase creates the machine), LBP with rate pre-fill. The D13 edit engine, Edited marker and per-entry history, used here first on expenses, machines and settings.

| ID | Test | Kind |
| --- | --- | --- |
| S-01 | Saving a setting adds a dated row; the old one stays; "current" = latest `valid_from` ≤ now | db |
| S-02 | Changing machine power or life applies to jobs started after it only (jobs snapshot) | db |
| S-03 | Filament purchase writes one expense row and one +movement with price per gram and updated average, **in one transaction** (a forced failure halfway leaves no rows) | db |
| S-04 | Expense in LBP pre-fills the rate from Settings and reports USD correctly (C-15 numbers) | e2e |
| E-01 | Edit engine: changing two fields writes exactly two `edit_log` rows with old and new values; unchanged fields write none | db |
| E-02 | Delete is soft (`deleted_at`), logged with all values, and the row disappears from lists and views | db |
| E-03 | Editing a purchase's grams updates its stock movement and the averages after it, and logs that too | db |
| E-04 | e2e: edit an expense → row shows "✎ Edited <date time>"; its history shows the change | e2e |
| E-05 | e2e: a save that fails on the server (simulated) keeps every typed value and shows the error (D41) | e2e |
| V-01 | Every form: Zod rejects bad input with a message under the right field (table-driven over all schemas) | unit |

**Exit:** you can enter your printer price, electricity price and first filament purchase on the live site.

### M3. Recipes: G-code import, Products, Cost calculator

**Builds:** Products (product or part, sale price, packaging item; parts list comes in M6), Recipes import flow (client upload to Blob → Server Action parses with the M1 parser → items pre-filled → grams check → save version), recipe page (parsed specs, thumbnail, download original, overrides with history, versions), Cost calculator (browser-only parse, nothing saved, "Save as recipe" hands off to import).

| ID | Test | Kind |
| --- | --- | --- |
| R-01 | Importing the croix file creates recipe v1 with 1 item × 4 and no grams typing | e2e |
| R-02 | Stored file: SHA-256 in the DB matches the uploaded bytes; Download returns the identical bytes (rule 7) | db + e2e |
| R-03 | Importing a new file into the same recipe creates v2, flips `is_current`, keeps v1 untouched | db |
| R-04 | Override grams → shown next to the parsed value, logged in `edit_log`, past jobs unchanged | db |
| R-05 | Two different items whose grams don't add up within tolerance → Save disabled with the exact gap shown (synthetic two-object file until J7 arrives) | e2e |
| R-06 | Re-uploading an identical file is detected by hash and offered as "same file" | db |
| K-01 | Cost calculator with the padel file and the M1 assumptions shows job **$0.77** and per piece **$0.87** (allowance) | e2e |
| K-02 | Cost calculator saves nothing: row counts in every table unchanged, nothing uploaded | e2e |
| K-03 | Without an electricity price, the calculator shows "Cost incomplete: set electricity price" with a link to Settings | e2e |
| D-01 | Product with no sale price: blocked later from orders (tested again in M5); part with a price is rejected | db |

**Exit:** your two real files import on the live site and show the D40 values.

### M4. Start print, Finish print, Weigh filament  ← D8 target: real prints recorded

**Builds:** Start (recipe, printer pre-selected if only one, busy printers blocked with "Busy: X, started HH:MM" and a Finish link, filament per colour, cost estimate), Finish (duration pre-filled with "Same as G-code" chip and `hours_source`, good pieces per item, stopped at %, optional weighed grams, power-cut flag, live cost, "Save and add to stock"), Weigh filament (all open spools, empty-spool weight, difference → adjustment + movement). Views `cost_per_good_unit`. Today screen shows "printing now".

| ID | Test | Kind |
| --- | --- | --- |
| J-01 | Golden path: import padel → Start → Finish 1 good, untouched time → job cost 0.76841, unit 0.87319, stock of padel holder +1 at 0.87319, filament −29.22 g | e2e + db |
| J-02 | `hours_source`: untouched = `gcode_estimate`; chip = `confirmed`; changed = `entered`, with the matching label text | e2e |
| J-03 | Busy printer: Start shows the busy message and Finish link only; the database also rejects a direct second insert (F-03) | e2e |
| J-04 | Partial success (croix 3 of 4): stock +3 at 0.10380 (actual method seeded with 20 prior prints), waste 0.07785 shown on the job | db |
| J-05 | Stopped at 60%, not weighed → grams 5.082 for croix, job marked "estimated" | db |
| J-06 | Weighed grams entered → grams source `weighed`, no "estimated" badge | db |
| J-07 | Snapshots: changing electricity price after Start does not change that job's cost | db |
| J-08 | Editing a finished job's good count updates its stock movement and logs both (D13) | db |
| J-09 | Weigh filament: 2 spools read 612 g and 402 g, empty spool 140 g each → measured 734 g; difference vs expected stored as a weigh-in adjustment + one movement | db |
| J-10 | Printer model or nozzle mismatch between recipe and machine → warning on Start (D16) | e2e |
| J-11 | Missing machine purchase cost → cost shown incomplete with a link to the machine | e2e |

**Exit:** you record your first real print on your phone. This is the D8 checkpoint: if M4 is not live within 2 weeks of starting, we discuss the spreadsheet fallback, as the spec says.

### M5. Customers, Orders, reservations, Deliver, Record payment

**Builds:** Customers (list, page with orders and balance owed, quick-add from an order), Orders list (status, payment state, due date, balance) and detail (lines with price pre-filled and editable, $0 allowed, reserve, "need to print N", status steps, Deliver whole order, delivery charge "for the driver"), Record payment (method, collected by, courier COD with Mark received, refunds as negative), `order_balance`, `order_shortfall`, `profit_per_hour` views.

Note: the spec's cut line lists reservations last, but D35 makes Deliver depend on full reservation, so reservations have to ship with Orders. That is the only place this plan departs from the cut line.

| ID | Test | Kind |
| --- | --- | --- |
| O-01 | Product without a sale price can't be added: message "Set a sale price for this product first" with a link (D31) | e2e |
| O-02 | Line price pre-filled, changed to $0 → allowed, sale still takes stock and cost, order shows the loss (D45) | db |
| O-03 | Reserve: 5 ordered, 2 available → reserved 2, "need to print 3"; on hand unchanged, available −2 | db |
| O-04 | Deliver disabled until every line is fully reserved (D35) | e2e |
| O-05 | Deliver writes −stock per line and −1 packaging per unit, snapshots unit cost (weighted average, D38), labour minutes and packaging cost, in one transaction | db |
| O-06 | Cancelling or deleting an order releases its reservations | db |
| O-07 | Order total = lines only; delivery charge shown but excluded from total, balance and profit (D37) | db |
| Y-01 | Payment states: none = Unpaid; $3 of $5 = Partly paid; $5 = Paid; refund −$5 = Unpaid again | db |
| Y-02 | Courier COD without `received_at` shows "Courier has cash" and is not counted as cash; Mark received fixes both | e2e |
| Y-03 | LBP payment converts at its own stored rate, not today's | db |
| Y-04 | Customer page balance owed = sum of their orders' balance due | db |
| G-01 | **Golden scenario** (one long e2e test, phone size): buy filament → import padel → print 2 → order 2 for a customer at $5 → reserve → deliver → deposit $4 then $6 → order Paid, profit = 10 − 2 × 0.87319 − packaging, profit per hour shown | e2e |

### M6. Parts lists and Assemble, Change history, Today, Stock

**Builds:** product parts list (BOM), Assemble (made N of X: −parts, +product, warns but allows negative parts per D36, assembly minutes), Change history screen (all edits, filter by table and date), Stock screen (filament, parts, products, consumables; negatives in red), Today dashboard.

| ID | Test | Kind |
| --- | --- | --- |
| B-01 | Assemble 3 of a product with 2 × part A each → A −6, product +3 at Σ(part avg cost × qty), one transaction | db |
| B-02 | Parts short → warning shown, save allowed, part stock negative and red on Stock and Assemble (D36) | e2e |
| B-03 | `order_shortfall` for an assembled product lists the parts needed | db |
| H-01 | Change history lists every edit from E/J/O tests with old → new values, newest first | e2e |
| T-01 | Today shows "printing now" with start time, and orders due soon | e2e |

### M7. Go-live hardening

**Builds:** weekly backup GitHub Action (rule 6: `pg_dump` + CSV of every table + copy of Blob G-code files, stored as an encrypted release artifact in the private repo), restore drill script, production smoke test, error page that keeps typed values.

| ID | Test | Kind |
| --- | --- | --- |
| K-B1 | Backup job runs on schedule and produces a dump, CSVs and the G-code files | CI |
| K-B2 | Restore drill: the latest dump restores into a throwaway Neon branch and row counts match | CI (monthly) |
| K-S1 | Smoke after deploy: `/login` 200, `/api/health` 200 with database reachable | CI |

[Certain] Neon's Free plan keeps only **6 hours** of restore history ([Neon plans](https://neon.com/docs/introduction/plans)), so the weekly backup is not optional: after 6 hours, a bad write can only be undone from our own backup.

---

## 5. Migration safety (D44: one live database)

Every PR that adds a migration goes through these steps automatically:

1. **CI on empty Postgres:** all migrations apply from zero (F-01), and the full test suite runs on the result.
2. **Rehearsal on live data:** a GitHub Action creates a Neon branch from production (a free, instant copy), applies the new migration there, runs the database tests that read existing data plus row-count checks, then deletes the branch. [Certain] Free allows 10 branches per project ([Neon plans](https://neon.com/docs/introduction/plans)); we use 1, briefly.
3. **Backup before apply:** on merge, the deploy workflow takes a `pg_dump` first, then runs `drizzle-kit migrate`, then deploys the app.
4. **Expand, then contract (rule 2):** a migration only adds. Anything removed goes in a later migration, after the new shape has been in use. A lint check fails any migration containing `DROP` or `ALTER … TYPE` unless the PR is labelled `contract`.
5. **Merged migrations are never edited.** A CI check compares merged migration files with `main` and fails on changes.

---

## 6. CI pipeline (one workflow, `.github/workflows/ci.yml`)

```text
install (pnpm, cached)
├─ typecheck ─┐
├─ lint ──────┤
├─ unit ──────┤  (parallel)
└─ db tests ──┘  Postgres 17 service container
      └─ build → e2e (Playwright: phone + desktop, axe, tap and contrast checks)
                   └─ migration rehearsal (only if drizzle/ changed and Neon secrets exist)
```

Playwright runs with traces off and retries failures once, and uploads screenshots of failures as artifacts, so a red check shows what broke without anyone reproducing it.

---

## 7. Risks I see in your plan

1. **Scope vs D8.** Fifteen screens is roughly three times what two weeks holds with this test bar. Mitigation: the D8 checkpoint is M4, not M7.
2. **Placeholder numbers in tests.** The $200 printer price is a test value. When you enter the real price, the live numbers change; the tests don't, because they test the formula, not your data.
3. **Multi-product plates are untested on a real file (J7).** The synthetic file in R-05 is my guess at Creality Print's format for two different STLs [Guessing]. One real file removes the guess.
4. **Electricity is a fifth of print cost, not a tenth** at $0.64/kWh (spec open question). Worth checking that figure, since it moves every unit cost.
5. **Vercel Blob client uploads in CI** are replaced by the in-memory adapter, so the real upload path is only proven by the post-deploy smoke test and your first import. [Likely] low risk, but it is the one path CI can't fully cover.

---

## 8. Order of work from here

1. You: J1 (create the repo).
2. Me: push the M0 scaffold as PR #1 against `main`, CI included.
3. Me, without stopping: M0 → M1 → M2 → M3 → M4, one PR each, each green before the next starts on top of it.
4. You, once, at the end of M0: J2–J4 (about 15 minutes in Vercel and Neon). Before real use: J5.
