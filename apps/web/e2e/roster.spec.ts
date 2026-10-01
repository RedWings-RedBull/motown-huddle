import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("roster", () => {
  test("lists the squad by position group", async ({ page }) => {
    await page.goto("/roster/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Roster");
    await expect(page.getByRole("heading", { name: /Quarterbacks/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Offensive line/ })).toBeVisible();
    const cards = page.locator("li[data-player]");
    expect(await cards.count()).toBeGreaterThan(40);
    await expect(cards.filter({ hasText: "Jared Goff" })).toHaveCount(1);
  });

  test("has no accessibility violations", async ({ page }) => {
    await page.goto("/roster/");
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});
