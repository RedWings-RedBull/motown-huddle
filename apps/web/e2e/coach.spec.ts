import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("coach's corner", () => {
  test("shows the index, league ranking, decision log and era record", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/coach/");
    await expect(page.getByRole("heading", { name: "Fourth-Down Aggression Index" })).toBeVisible();
    await expect(page.locator("[data-league] li")).toHaveCount(32);
    await expect(page.locator("[data-log]").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Era tracker" })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("calculator responds to the sliders with the keyboard", async ({ page }) => {
    await page.goto("/coach/");
    const calc = page.locator("[data-calculator]");
    await calc.scrollIntoViewIfNeeded();
    // client:visible island: wait until Astro has hydrated it before using the keyboard.
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
