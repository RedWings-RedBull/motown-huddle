import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("next game preview", () => {
  test("shows the matchup, key matchups and both profiles", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/preview/");
    // The countdown island hydrates on idle; give it a tick to render its cells or the fallback.
    await expect(page.locator("time").first()).toBeVisible();
    await page.waitForTimeout(1500);
    expect(errors).toEqual([]);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/DET (vs|at) [A-Z]{2,3}/);
    await expect(page.getByRole("heading", { name: "Key matchups" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /DET season to date/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Injury report" })).toBeVisible();
    await expect(page.getByRole("list", { name: "Game details" })).toContainText(/total/);
  });

  test("has no accessibility violations", async ({ page }) => {
    await page.goto("/preview/");
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});
