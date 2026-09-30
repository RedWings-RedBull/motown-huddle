import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("home", () => {
  test("renders the brand, landmarks and disclaimer", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Motown Huddle/);
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("contentinfo")).toContainText("Unofficial fan site");
    await expect(page.getByRole("link", { name: "Skip to content" })).toHaveCount(1);
  });

  test("has no accessibility violations", async ({ page }) => {
    await page.goto("/");
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});

test.describe("404", () => {
  test("serves a friendly not-found page", async ({ page }) => {
    const response = await page.goto("/definitely-not-a-page/");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Fourth and long");
  });
});
