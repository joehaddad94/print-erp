# Progress log

Updated after every meaningful step so work can resume after an interruption. Plan: [IMPLEMENTATION-PLAN.md](IMPLEMENTATION-PLAN.md).

## Status

| Milestone | State | PR |
| --- | --- | --- |
| M0 Foundations (scaffold, theme, schema, login, tests) | Merged Nov 25 | #1 |
| M1 G-code parser + cost engine | Verified, PR open | #2 |
| M2 Settings, machines, suppliers, expenses, edit engine | Not started | — |
| M3 Recipes import, products, cost calculator | Not started | — |
| M4 Start / Finish print, weigh filament | Not started | — |

## Next step

M2: settings (dated), machines, suppliers, Add expense with purchases (filament → stock + average), D13 edit engine (edit_log, Edited marker, history).

## Open issues

- GitHub Actions doesn't start on this account ("account is locked due to a billing issue", Nov 25). Per the plan, the local `pnpm verify` run is the gate. Nothing paid will be added.
- Repo is public: Joe's real `.gcode` fixtures are gitignored (`tests/fixtures/*.gcode.gz`); tests that need them skip when absent. Decision pending: make the repo private and commit them.
- Vercel + Supabase setup in progress by Joe (env vars: DATABASE_URL, DIRECT_URL, AUTH_SECRET, ADMIN_USERNAME, ADMIN_PASSWORD, BLOB_READ_WRITE_TOKEN).

## Resume checklist (for a fresh session)

1. `service postgresql start` (local Postgres 16 on :5432, user/password postgres).
2. `cp .env.example .env.local && pnpm install`.
3. Fixtures: `gzip -9 -c "<fixtures>/<file>.gcode" > tests/fixtures/<slug>.gcode.gz` from the project's shared `3d-printing/fixtures/` folder.
4. `pnpm verify` before every merge; paste the summary into the PR.
