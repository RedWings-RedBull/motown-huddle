import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("division page", () => {
  test("shows four clubs in the standings with odds and upcoming games", async ({ page }) => {
    await page.goto("/division/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/North|South|East|West/);
    await expect(page.locator("table[data-standings] tbody tr")).toHaveCount(4);
    await expect(page.locator("[data-odds]")).toHaveCount(4);
    await expect(page.getByRole("heading", { name: "Division and playoff odds" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Efficiency" })).toBeVisible();
  });

  test("has no accessibility violations", async ({ page }) => {
    await page.goto("/division/");
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});
