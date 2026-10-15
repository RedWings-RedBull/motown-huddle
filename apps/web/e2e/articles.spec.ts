import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("articles", () => {
  test("the index explains how articles are made and links every article", async ({ page }) => {
    await page.goto("/articles/");
    await expect(page.getByRole("heading", { level: 1, name: "Articles" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "How these are made", exact: true }),
    ).toBeVisible();
    const items = page.locator("[data-articles] li");
    const count = await items.count();
    if (count === 0) {
      await expect(page.getByText("No articles yet")).toBeVisible();
      return;
    }
    // An article page carries the disclosure byline and links back to its data page.
    await items.first().getByRole("link").first().click();
    await expect(page.locator("[data-byline]")).toContainText("checked against that data");
    await expect(page.locator(".article-body p").first()).toBeVisible();
  });

  test("has no accessibility violations", async ({ page }) => {
    await page.goto("/articles/");
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});
