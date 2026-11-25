# print-erp

Costs, stock and orders for a one-printer 3D printing business. Spec: v0.7 (D1–D47). Plan: [docs/IMPLEMENTATION-PLAN.md](docs/IMPLEMENTATION-PLAN.md).

Stack: Next.js 16 (App Router, Server Actions, TypeScript strict) · Tailwind CSS 4 (design tokens only) · Zod · Drizzle ORM + SQL migrations · Supabase Postgres · Vercel Blob · argon2id + signed cookie sessions.

## Layout

```text
src/app/(auth)/login        public sign-in
src/app/(app)/…             signed-in screens (layout checks the session)
src/components/ui/          design-system components (Button, Field, Badge, …)
src/components/shell/       navigation (phone tabs, desktop sidebar)
src/styles/tokens.css       design tokens, light + dark (source: mockup/design-system.html)
src/app/globals.css         Tailwind @theme: maps semantic tokens to utilities, clears defaults
src/lib/                    pure logic: auth, money (later: gcode, cost)
src/server/<feature>/       Server Actions, Zod schemas, database services
src/db/schema/              Drizzle tables (21) and views
drizzle/                    SQL migrations (never edit one after merge)
scripts/                    bootstrap (deploy), verify, set-password, check-migrations
tests/{unit,db,e2e}/        Vitest, Vitest + Postgres, Playwright (phone + desktop, axe)
```

## Tailwind rules

Only token utilities exist: `bg-surface`, `text-ink-muted`, `bg-danger-bg text-danger`, `rounded-md`, `text-sm`, `min-h-tap`. Tailwind's default palette, radii and font sizes are cleared, and ESLint rejects arbitrary values (`w-[37px]`). New token: add it in `tokens.css` (light and dark) and map it in `globals.css`; the contrast test checks it.

## Environment (Vercel → Settings → Environment Variables)

| Name | Value |
| --- | --- |
| `DATABASE_URL` | Supabase → Connect → Transaction pooler (port 6543) |
| `DIRECT_URL` | Supabase → Connect → Session pooler (port 5432), used for migrations at deploy |
| `AUTH_SECRET` | 32+ random characters |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | first user, created on deploy if none exists; remove after first login |
| `BLOB_READ_WRITE_TOKEN` | set by Vercel when a Blob store is connected |

Every Vercel build runs `scripts/bootstrap.ts` first: migrations, then seed, then first user. A failing migration stops the deploy.

## Local development

```bash
cp .env.example .env.local      # local Postgres on :5432
pnpm install
pnpm db:bootstrap               # migrate + seed (+ ADMIN_* user if set)
pnpm dev
```

## Verify (the merge gate)

```bash
pnpm verify   # typecheck, lint, format, migration checks, unit, db, build, e2e
```

Database tests create throwaway databases on `TEST_PG_ADMIN_URL` (default `postgres://postgres:postgres@localhost:5432/postgres`). Never point it at Supabase.

## Reset a password (D42, no email)

```bash
NEW_PASSWORD='…' DIRECT_URL='…' pnpm user:set-password joe
```
