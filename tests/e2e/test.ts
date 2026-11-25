import { test as base } from "@playwright/test";

export { expect, type Page } from "@playwright/test";

/**
 * Next keeps up to 3 visited routes mounted but hidden (React Activity, cacheComponents), so the
 * same form can exist twice in the DOM. getByRole already skips hidden elements; this makes
 * page.getByLabel do the same, so tests act on what the user actually sees.
 */
export const test = base.extend({
  page: async ({ page }, provide) => {
    const getByLabel = page.getByLabel.bind(page);
    page.getByLabel = (text, options) => getByLabel(text, options).filter({ visible: true });
    await provide(page);
  },
});
