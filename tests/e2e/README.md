# End-to-end tests (Playwright)

Every test runs twice: **phone** (390×844) and **desktop** (1280×800), Chromium, against the
**production build** (`next build` then `next start`), never `next dev`.

## Run

```sh
pnpm exec next build          # once after code changes
pnpm test:e2e                 # full suite, app → Postgres directly
pnpm test:e2e:pooled          # full suite, app → PgBouncer (transaction mode) → Postgres
pnpm test:e2e -g "G-02"       # one test by name
```

Needs a local Postgres for throwaway databases (`TEST_PG_ADMIN_URL`, default
`postgres://postgres:postgres@localhost:5432/postgres`). Never point it at Supabase: global setup drops and
recreates `print_erp_e2e`.

Joe's real G-code files are not in the repo (it is public). Put them gzipped in `tests/fixtures/`
(`adidas-padel-racket-holder.gcode.gz`, `new-croix_pla_1h8m.gcode.gz`); tests that need them skip, and the
golden flow falls back to a synthetic file, when they are absent.

## Pooled mode (like Supabase on Vercel)

On Vercel the app's `DATABASE_URL` is Supabase's **transaction pooler** (port 6543): no session state, no
prepared statements. `pnpm test:e2e:pooled` reproduces that: the app connects through PgBouncer in
`pool_mode = transaction` on `127.0.0.1:6543` (override with `E2E_POOLER_URL`), while test setup uses the
direct connection. Start the pooler first, with `tests/e2e/pgbouncer/pgbouncer.ini`:

```sh
# Linux / WSL: userlist.txt holds the scram secret from pg_authid
psql -Atc "select '\"'||rolname||'\" \"'||rolpassword||'\"' from pg_authid where rolname='postgres'" > tests/e2e/pgbouncer/userlist.txt
pgbouncer -d tests/e2e/pgbouncer/pgbouncer.ini
# or Docker
docker run --rm -p 6543:6432 -e DATABASE_URL=postgres://postgres:postgres@host.docker.internal:5432/postgres \
  -e POOL_MODE=transaction -e MAX_PREPARED_STATEMENTS=0 -e AUTH_TYPE=scram-sha-256 edoburu/pgbouncer
```

## Live smoke (read-only)

```sh
BASE_URL=https://your-app.vercel.app E2E_USERNAME=joe E2E_PASSWORD=… pnpm test:e2e:live
```

Runs only tests tagged `@smoke` (`smoke.spec.ts`): health check, login page, sign in, open every screen
inside a time budget with no console errors, sign out. It creates and changes nothing (signing in only
stamps the last-login time) and never tries a wrong password, so it can't throttle the real login.
No local database or server is started in this mode.

## What is covered

| File | What |
| --- | --- |
| `auth.spec.ts` | login, wrong password, forged cookie, sign out, a11y of login |
| `screens.spec.ts` | every screen and every detail page: loads within `E2E_PAGE_BUDGET_MS` (5 s), one heading, no error boundary, no console errors, axe WCAG 2.1 AA in light **and** dark, 44 px targets, no sideways scroll; unknown ids → Not found |
| `navigation.spec.ts` | phone tabs + More, desktop sidebar, back/forward |
| `records.spec.ts` | create / validation errors / edit with ✎ Edited and history / delete: customers, suppliers, products, parts lists, machines, orders, lines, payments (LBP, refunds), status, cancel, failed prints, double-submit, weigh, assemble |
| `golden.spec.ts` | G-02: the whole business through the UI only, with the real padel file |
| `load.spec.ts` | 40 concurrent screen loads and 50 health checks must all answer fast (pool leaks, hangs) |
| `smoke.spec.ts` | `@smoke` read-only subset for live |
| `m2`–`m7.spec.ts` | milestone acceptance tests (IDs from docs/IMPLEMENTATION-PLAN.md) |

Timeouts are tight on purpose (45 s per test, 15 s per navigation, 10 s per action, 8 s per assertion): a
page that hangs fails in seconds instead of waiting for Vercel's 300 s limit.

Next keeps up to 3 visited routes mounted but hidden (React Activity). `tests/e2e/test.ts` makes
`page.getByLabel` match only visible fields; import `test`/`expect` from `./test`, not `@playwright/test`.
