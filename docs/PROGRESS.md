# Progress log

Updated after every meaningful step so work can resume after an interruption. Plan: [IMPLEMENTATION-PLAN.md](IMPLEMENTATION-PLAN.md).

## Status

| Milestone | State | PR |
| --- | --- | --- |
| M0 Foundations (scaffold, theme, schema, login, tests) | Merged Nov 25 | #1 |
| M1 G-code parser + cost engine | Merged Nov 25 | #2 |
| M2 Settings, machines, suppliers, expenses, edit engine | Done: verify all green (89 unit, 34 db, 32 e2e) | #3 |
| M3 Recipes import, products, cost calculator | Done: verify all green (94 unit, 44 db, 42 e2e) | #4 |
| M4 Start / Finish print, weigh filament | Not started | — |

## Next step

M4 (branch `m4-print`): Start print, Finish print, Weigh filament, cost_per_good_unit view, Today shows printing now. Tests J-01..J-11.

## Open issues

- Vercel: a **Blob store** must be connected (Storage tab) for recipe import on the live site; set `BLOB_ACCESS` to match the store (default `private`). Without it the import page says so; the calculator still works.
- Vercel: scope `DATABASE_URL` / `DIRECT_URL` to Production only so PR previews can't touch live data. Bootstrap (migrations) already runs only on production builds.

- GitHub Actions doesn't start on this account ("account is locked due to a billing issue", Nov 25). Per the plan, the local `pnpm verify` run is the gate. Nothing paid will be added.
- Repo is public: Joe's real `.gcode` fixtures are gitignored (`tests/fixtures/*.gcode.gz`); tests that need them skip when absent. Decision pending: make the repo private and commit them.
- Vercel + Supabase setup in progress by Joe (env vars: DATABASE_URL, DIRECT_URL, AUTH_SECRET, ADMIN_USERNAME, ADMIN_PASSWORD, BLOB_READ_WRITE_TOKEN).

## Resume checklist (for a fresh session)

1. `service postgresql start` (local Postgres 16 on :5432, user/password postgres).
2. `cp .env.example .env.local && pnpm install`.
3. Fixtures: `gzip -9 -c "<fixtures>/<file>.gcode" > tests/fixtures/<slug>.gcode.gz` from the project's shared `3d-printing/fixtures/` folder.
4. `pnpm verify` before every merge; paste the summary into the PR.
