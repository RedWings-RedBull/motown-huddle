import AxeBuilder from "@axe-core/playwright";

import { expect, test } from "./fixtures";

test.describe("methodology", () => {
  test("renders every pool from the engine spec", async ({ page }) => {
    await page.goto("/methodology/");
    await expect(page.getByRole("heading", { name: /^Quarterback/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /^Punt returner|^Returner/ })).toBeVisible();
    await expect(page.getByText("EPA per dropback").first()).toBeVisible();
  });

  test("has no accessibility violations", async ({ page }) => {
    await page.goto("/methodology/");
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});
