import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

const GAME = "/games/2026/week-03/";

async function openGame(page: Page) {
  await page.goto(GAME);
  // The field is the only island and hydrates with client:visible, so scroll it into view and
  // wait until Astro has dropped the `ssr` marker before using the keyboard.
  await page.getByTestId("field").scrollIntoViewIfNeeded();
  await expect(page.locator("astro-island[ssr]")).toHaveCount(0);
}

const tiles = (page: Page) => page.getByTestId("field").locator('[role="button"][data-slot]');

test.describe("game breakdown", () => {
  test("renders the score, team panel, chart and 27 field tiles", async ({ page }) => {
    await openGame(page);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Win vs NYJ");
    await expect(page.getByRole("heading", { name: "Team level" })).toBeVisible();
    await expect(page.getByRole("img", { name: /win probability/i })).toBeVisible();
    await expect(tiles(page)).toHaveCount(27);
    await expect(page.getByTestId("slot-table").locator("tbody tr")).toHaveCount(27);
    await expect(page.getByTestId("slot-table").locator('tr[data-slot="LT"]')).toContainText(
      "Penei Sewell",
    );
  });

  test("key plays: embeddable highlights play in place, blocked ones open on YouTube", async ({
    page,
  }) => {
    await page.goto(GAME);
    const facades = page.locator(".yt");
    expect(await facades.count()).toBeGreaterThan(0);
    await expect(page.locator("iframe")).toHaveCount(0);

    const blocked = page.locator('.yt[data-embeddable="false"] a.yt-thumb').first();
    await expect(blocked).toHaveAttribute("href", new RegExp("youtube[.]com/watch"));
    await expect(blocked).toHaveAttribute("target", "_blank");
    await expect(blocked).toHaveAttribute("rel", new RegExp("noopener"));

    const playable = page.locator('.yt[data-embeddable="true"]').first();
    const button = playable.getByRole("button", { name: new RegExp("^Watch the play") });
    await button.scrollIntoViewIfNeeded();
    await button.click();
    const frame = playable.locator("iframe");
    await expect(frame).toHaveAttribute("src", new RegExp("youtube-nocookie[.]com/embed/"));
    await expect(frame).toHaveAttribute("title", new RegExp(".+"));
    await expect(button).toBeHidden();
    await expect(page.locator("iframe")).toHaveCount(1);
  });

  test("every tile is at least a 24 x 24 px target on this viewport", async ({
    page,
  }, testInfo) => {
    await openGame(page);
    await expect(page.getByTestId("field")).toHaveAttribute(
      "data-orientation",
      testInfo.project.name === "mobile" ? "portrait" : "landscape",
    );
    const boxes = await tiles(page).evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { w: r.width, h: r.height };
      }),
    );
    expect(boxes).toHaveLength(27);
    for (const box of boxes) {
      expect(box.w).toBeGreaterThanOrEqual(24);
      expect(box.h).toBeGreaterThanOrEqual(24);
    }
    // No horizontal page scroll on phones.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("keyboard: Tab/Enter opens the panel, arrows move focus, Escape closes", async ({
    page,
  }, testInfo) => {
    await openGame(page);
    const qb = page.getByRole("button", { name: /^Quarterback, Jared Goff/ });
    await qb.focus();
    await expect(qb).toBeFocused();
    await page.keyboard.press("Enter");

    const panel =
      testInfo.project.name === "mobile"
        ? page.getByRole("dialog")
        : page.getByRole("complementary", { name: "Quarterback" });
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("Jared Goff");
    await expect(panel).toContainText("EPA per dropback");
    await expect(qb).toHaveAttribute("aria-pressed", "true");

    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await expect(qb).toBeFocused();

    if (testInfo.project.name !== "mobile") {
      // Escape also closes the desktop panel when focus has moved into it.
      await page.keyboard.press("Enter");
      await expect(panel).toBeVisible();
      await panel.getByRole("button", { name: "Close" }).focus();
      await page.keyboard.press("Escape");
      await expect(panel).toBeHidden();
      await expect(qb).toBeFocused();
    }

    // Arrow keys follow the layout's reading order: RB sits after QB on the landscape field,
    // WR1 on the portrait (phone) field.
    const next =
      testInfo.project.name === "mobile"
        ? page.getByRole("button", { name: /^Wide receiver 1, Amon-Ra St. Brown/ })
        : page.getByRole("button", { name: /^Running back, Jahmyr Gibbs/ });
    await page.keyboard.press("ArrowRight");
    await expect(next).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(qb).toBeFocused();
  });

  test("OL tiles explain the unit grade", async ({ page }, testInfo) => {
    await openGame(page);
    await page.getByRole("button", { name: /^Left tackle, Penei Sewell/ }).click();
    const panel =
      testInfo.project.name === "mobile"
        ? page.getByRole("dialog")
        : page.getByRole("complementary");
    await expect(panel).toContainText("free data has no per-lineman blocking grades");
    await expect(panel).toContainText("Offensive Holding");
  });

  test("unit toggle filters the tiles", async ({ page }) => {
    await openGame(page);
    await page.getByRole("button", { name: "Defense", exact: true }).click();
    await expect(tiles(page)).toHaveCount(11);
    await page.getByRole("button", { name: "Special teams", exact: true }).click();
    await expect(tiles(page)).toHaveCount(5);
    await page.getByRole("button", { name: "All", exact: true }).click();
    await expect(tiles(page)).toHaveCount(27);
  });

  test("mobile opens a native dialog bottom sheet", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "mobile only");
    await openGame(page);
    await page.getByRole("button", { name: /^Kicker, Jake Bates/ }).click();
    const dialog = page.locator("dialog[open]");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Jake Bates");
    await expect(page.getByRole("complementary")).toHaveCount(0);
    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).toHaveCount(0);
  });

  test("has no accessibility violations", async ({ page }) => {
    await openGame(page);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test("has no accessibility violations with the panel open", async ({ page }) => {
    await openGame(page);
    await page.getByRole("button", { name: /^Quarterback/ }).click();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});

test.describe("games index", () => {
  test("lists the week newest first with a tier badge", async ({ page }) => {
    await page.goto("/games/");
    const first = page.getByRole("main").getByRole("list").first().getByRole("listitem").first();
    await expect(first).toContainText("Win vs NYJ, 31-24");
    // The committed week is whichever tier the last pipeline run produced.
    await expect(first).toContainText(/Provisional|Final/);
    await first.getByRole("link").click();
    await expect(page).toHaveURL(/\/games\/2026\/week-03\/$/);
  });
});

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
