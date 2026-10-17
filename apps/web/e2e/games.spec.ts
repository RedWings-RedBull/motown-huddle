import { expect, test } from "./fixtures";
import { latest } from "./latest";

test.describe("games index", () => {
  test("lists the week newest first with a tier badge", async ({ page }) => {
    await page.goto("/games/");
    const first = page.getByRole("main").getByRole("list").first().getByRole("listitem").first();
    await expect(first).toContainText(
      `${latest.headline}, ${String(latest.teamScore)}-${String(latest.oppScore)}`,
    );
    // The committed week is whichever tier the last pipeline run produced.
    await expect(first).toContainText(/Provisional|Final/);
    await first.getByRole("link").click();
    await expect(page).toHaveURL(new RegExp(`${latest.path}$`));
  });
});
