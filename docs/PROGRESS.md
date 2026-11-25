# Progress log

Updated after every meaningful step so work can resume after an interruption. Plan: [IMPLEMENTATION-PLAN.md](IMPLEMENTATION-PLAN.md).

## Status

| Milestone | State | PR |
| --- | --- | --- |
| M0 Foundations (scaffold, theme, schema, login, tests) | Merged Nov 25 | #1 |
| M1 G-code parser + cost engine | Merged Nov 25 | #2 |
| M2 Settings, machines, suppliers, expenses, edit engine | Done: verify all green (89 unit, 34 db, 32 e2e) | #3 |
| M3 Recipes import, products, cost calculator | Done: verify all green (94 unit, 44 db, 42 e2e) | #4 |
| M4 Start / Finish print, weigh filament | Done: verify all green (100 unit, 54 db, 50 e2e). `cost_per_good_unit` view deferred to M6: unit cost is stored per job line | #6 |
| M5 Customers, orders, reserve, deliver, payments | Done: verify all green; G-01 golden scenario profit $8.25, $16.51/h | #7 |
| M6 Parts lists, Assemble, Stock, Change history, Today due soon | Done: verify all green (115 unit, 68 db, 62 e2e). Unit cost stays per job line instead of a `cost_per_good_unit` view | #8 |
| M7 Go-live: weekly backup (Vercel Cron), Download backup, restore script, smoke test, error pages | Done: verify all green (115 unit, 72 db, 70 e2e); K-B2 restore drill matches every count and checksum | #9 |

## Next step

v0.1 is feature-complete (M0–M7). Remaining before real use, needs Joe in Vercel:
1. Fix the production deploy: the build log's `bootstrap:` lines say which DB setting is wrong (most likely the Supabase password in `DIRECT_URL` / `DATABASE_URL` after the reset).
2. Connect a **private** Blob store (Storage → Blob), keep `BLOB_ACCESS=private`.
3. Add `CRON_SECRET` (16+ random characters) so the weekly backup runs.
4. After the deploy is green: `pnpm smoke https://<app>.vercel.app`, then remove `ADMIN_USERNAME` / `ADMIN_PASSWORD`.
