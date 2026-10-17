/**
 * Every spec fails if the page throws: a React island that breaks on hydration would otherwise
 * pass as long as the server-rendered HTML looked right.
 */
import { expect, test as base } from "@playwright/test";

export { expect };

export const test = base.extend({
  page: async ({ page }, use) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await use(page);
    expect(errors).toEqual([]);
  },
});
