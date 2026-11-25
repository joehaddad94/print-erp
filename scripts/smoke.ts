/**
 * K-S1 smoke test after a deploy: /login answers 200 and /api/health says the database is reachable.
 *
 *   pnpm smoke https://your-app.vercel.app
 */
async function check(url: string, test: (r: Response) => Promise<boolean>) {
  try {
    const r = await fetch(url, { redirect: "manual" });
    const ok = await test(r);
    console.log(`${ok ? "ok  " : "FAIL"} ${url} → ${r.status}`);
    return ok;
  } catch (e) {
    console.log(`FAIL ${url} → ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

async function main() {
  const base = (process.argv[2] ?? process.env.SMOKE_URL ?? "").replace(/\/$/, "");
  if (!base) throw new Error("Usage: pnpm smoke <base-url>");
  const results = [
    await check(`${base}/login`, async (r) => r.status === 200),
    await check(
      `${base}/api/health`,
      async (r) => r.status === 200 && ((await r.json()) as { ok?: boolean }).ok === true,
    ),
  ];
  if (results.includes(false)) process.exit(1);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
