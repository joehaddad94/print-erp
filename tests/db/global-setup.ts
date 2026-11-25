import { freshDatabase } from "../support/pg";

/** One fresh, fully migrated database per test run. F-01 relies on this succeeding. */
export default async function setup() {
  process.env.TEST_DATABASE_URL = await freshDatabase("print_erp_test");
}
