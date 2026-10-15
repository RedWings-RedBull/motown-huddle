import { describe, expect, it } from "vitest";

import { buildBundle } from "../src/bundle.js";
import { allowedNumbers, checkArticle, properPhrases } from "../src/ground.js";
import { DATA_DIR, groundedRecap } from "./helpers.js";

const recap = buildBundle("recap", DATA_DIR, 2026, 3);

describe("grounding check", () => {
  it("passes an article whose numbers, names and plays all come from the data", () => {
    const report = checkArticle(groundedRecap(), recap);
    expect(report.violations).toEqual([]);
    expect(report.counts.plays).toBe(3);
    expect(report.counts.words).toBeGreaterThanOrEqual(350);
  });

  it("knows the numbers the data allows, including percentages of rates", () => {
    const allowed = allowedNumbers(recap);
    expect(allowed).toEqual(expect.arrayContaining([31, 24, 17, 2026, 3]));
  });

  it("flags invented numbers, names, play tags and untagged play claims", () => {
    const bad = groundedRecap(
      [
        "Geno Smith threw for 412 yards.",
        "Gibbs added another touchdown before the half.",
        "A late field goal sealed it [p:999999].",
      ].join(" "),
    );
    const v = checkArticle(bad, recap).violations;
    expect(v).toContain('number not in the data: "412"');
    expect(v).toContain('name or term not in the data: "Geno Smith"');
    expect(v).toContain('play tag points at no play: "[p:999999]"');
    expect(
      v.some((x) => x.startsWith('play claim without a play tag: "Gibbs added another touchdown')),
    ).toBe(true);
  });

  it("accepts club, city and league names and skips headings and leading function words", () => {
    expect(properPhrases("After the Detroit Lions beat The New York Jets at Ford Field.")).toEqual([
      "Detroit Lions",
      "New York Jets",
      "Ford Field",
    ]);
    const withHeading = groundedRecap();
    withHeading.body = `## A Title Case Heading With Made Up Words\n\n${withHeading.body}`;
    expect(checkArticle(withHeading, recap).violations).toEqual([]);
  });

  it("treats safety the position as no play claim, but safety the score as one", () => {
    const position = groundedRecap("Ennis Rakestraw played at safety and held up.");
    expect(
      checkArticle(position, recap).violations.filter((v) => v.startsWith("play claim")),
    ).toEqual([]);
    const score = groundedRecap("The defense took a safety late.");
    expect(checkArticle(score, recap).violations.some((v) => v.startsWith("play claim"))).toBe(
      true,
    );
  });

  it("enforces a sensible length", () => {
    const short = { ...groundedRecap(), body: "The Detroit Lions won." };
    expect(checkArticle(short, recap).violations.some((v) => v.startsWith("too short"))).toBe(true);
    const long = { ...groundedRecap(), body: "word ".repeat(1200) };
    expect(checkArticle(long, recap).violations.some((v) => v.startsWith("too long"))).toBe(true);
  });

  it("does not require play tags in articles that have no plays", () => {
    const division = buildBundle("division", DATA_DIR, 2026, 3);
    const body = "The standings tightened and the touchdown totals told the story. ".repeat(60);
    const v = checkArticle(
      { title: "North standings", description: "x".repeat(60), body },
      division,
    ).violations;
    expect(v.filter((x) => x.startsWith("play claim"))).toEqual([]);
  });
});
