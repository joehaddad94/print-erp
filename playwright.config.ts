import { defineConfig, devices } from "@playwright/test";
import { urlFor } from "./tests/support/pg";

const PORT = 3100;
export const E2E_DB = "print_erp_e2e";
export const E2E_USER = { username: "joe", password: "e2e-password-123" };

/**
 * Runs against the production build (`next build` first; pnpm verify does it).
 * One browser (Chromium), two viewports: phone and desktop.
 */
export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 1,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "off", screenshot: "only-on-failure" },
  projects: [
    { name: "phone", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: `pnpm exec next start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      DATABASE_URL: urlFor(E2E_DB),
      AUTH_SECRET: "e2e-secret-e2e-secret-e2e-secret-0123",
    },
  },
});
