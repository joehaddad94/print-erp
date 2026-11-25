import { defineConfig, devices } from "@playwright/test";
import { urlFor } from "./tests/support/pg";

const PORT = 3100;
export const E2E_DB = "print_erp_e2e";
export const E2E_UPLOAD_DIR = ".data/e2e-uploads";
export const E2E_CRON_SECRET = "e2e-cron-secret-0123456789";
export const E2E_USER = {
  username: process.env.E2E_USERNAME ?? "joe",
  password: process.env.E2E_PASSWORD ?? "e2e-password-123",
};

/**
 * Three ways to run (tests/e2e/README.md):
 *  - `pnpm test:e2e`         production build (`next start`) on a fresh local database, direct connection.
 *  - `pnpm test:e2e:pooled`  same, but the app talks to Postgres through PgBouncer in transaction mode
 *                            (port 6543), like Supabase's transaction pooler on Vercel.
 *  - `BASE_URL=https://… E2E_USERNAME=… E2E_PASSWORD=… pnpm test:e2e:live`
 *                            read-only @smoke subset against a deployed app. Nothing is created or changed.
 */
const LIVE_URL = process.env.BASE_URL?.replace(/\/$/, "");
/** Where the app's runtime connection goes. The tests' own setup always uses the direct URL. */
const APP_DATABASE_URL = process.env.E2E_APP_DATABASE_URL ?? urlFor(E2E_DB);

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: LIVE_URL ? undefined : "./tests/e2e/global-setup.ts",
  grep: LIVE_URL ? /@smoke/ : undefined,
  fullyParallel: false,
  workers: 1,
  retries: LIVE_URL ? 0 : 1,
  reporter: [["list"]],
  // No page may hang: tight budgets everywhere, so a stuck request fails fast instead of waiting 300 s.
  timeout: 45_000,
  expect: { timeout: 8_000 },
  use: {
    baseURL: LIVE_URL ?? `http://localhost:${PORT}`,
    trace: "off",
    screenshot: "only-on-failure",
    navigationTimeout: 15_000,
    actionTimeout: 10_000,
  },
  projects: [
    { name: "phone", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: LIVE_URL
    ? undefined
    : {
        command: `pnpm exec next start -p ${PORT}`,
        url: `http://localhost:${PORT}/login`,
        reuseExistingServer: false,
        timeout: 60_000,
        env: {
          DATABASE_URL: APP_DATABASE_URL,
          AUTH_SECRET: "e2e-secret-e2e-secret-e2e-secret-0123",
          LOCAL_UPLOAD_DIR: E2E_UPLOAD_DIR,
          BLOB_READ_WRITE_TOKEN: "",
          CRON_SECRET: E2E_CRON_SECRET,
        },
      },
});
