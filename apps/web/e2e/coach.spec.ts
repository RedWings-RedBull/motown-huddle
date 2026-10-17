import AxeBuilder from "@axe-core/playwright";

import { expect, test } from "./fixtures";

test.describe("coach's corner", () => {
  test("shows the index, league ranking, decision log and era record", async ({ page }) => {
    await page.goto("/coach/");
    await expect(
      page.getByRole("heading", { name: "Fourth-Down Aggression Index", exact: true }),
    ).toBeVisible();
    await expect(page.locator("[data-league] li")).toHaveCount(32);
    await expect(page.locator("[data-log]").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Era tracker", exact: true })).toBeVisible();
  });

  test("calculator responds to the sliders with the keyboard", async ({ page }) => {
    await page.goto("/coach/");
    const calc = page.locator("[data-calculator]");
    await calc.scrollIntoViewIfNeeded();
    // A key pressed before the island hydrates is lost; wait for Astro to drop the `ssr` marker.
    await expect(page.locator("astro-island[ssr]")).toHaveCount(0);
    const go = calc.locator("[data-choice=go] .display");
    await expect(go).not.toHaveText("—");
    const before = await go.textContent();
    const togo = page.getByLabel(/Yards to go/);
    await togo.focus();
    await page.keyboard.press("End");
    await expect(go).not.toHaveText(before ?? "");
  });

  test("has no accessibility violations", async ({ page }) => {
    await page.goto("/coach/");
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});
