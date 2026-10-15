import { describe, expect, it } from "vitest";

import { buildBundle, bundleHash, latestWeek } from "../src/bundle.js";
import { DATA_DIR } from "./helpers.js";

describe("bundles", () => {
  it("finds the newest week in the manifest", () => {
    expect(latestWeek(DATA_DIR)).toEqual({ season: 2026, week: 3 });
  });

  it("builds the recap from the week's files with the line spelled out", () => {
    const b = buildBundle("recap", DATA_DIR, 2026, 3);
    expect(b).toMatchObject({ type: "recap", season: 2026, week: 3, gameId: "2026_03_NYJ_DET" });
    expect(b.gamePath).toBe("/games/2026/week-03/");
    expect(b.facts).toMatchObject({
      team: "Detroit Lions",
      opponent: "New York Jets",
      result: "W",
      score: { DET: 31, NYJ: 24 },
      stadium: "Ford Field",
      // Schedule spread 7 is from the home side: Detroit, at home, favoured by 7.
      line: { favorite: "Detroit Lions", favoredByPoints: 7, overUnderTotal: 49.5 },
    });
    expect(b.plays).toHaveLength(12);
    expect(b.people).toContain("Jahmyr Gibbs");
    const facts = b.facts as { topGraded: { huddleGrade: number }[] };
    const grades = facts.topGraded.map((p) => p.huddleGrade);
    expect(grades).toEqual([...grades].sort((x, y) => y - x));
  });

  it("builds the division and preview bundles from the season-wide files", () => {
    const division = buildBundle("division", DATA_DIR, 2026, 3);
    expect(division.plays).toEqual([]);
    const facts = division.facts as { standings: unknown[]; upcoming: { line: unknown }[] };
    expect(facts.standings).toHaveLength(4);
    for (const u of facts.upcoming) expect(u.line).toHaveProperty("favorite");

    const preview = buildBundle("preview", DATA_DIR, 2026, 3);
    expect(preview.week).toBeGreaterThan(3);
    expect(preview.people.length).toBeGreaterThan(0);
    expect(preview.facts).toHaveProperty("line.favorite");
  });

  it("hashes deterministically and changes with the data", () => {
    const a = buildBundle("recap", DATA_DIR, 2026, 3);
    const b = buildBundle("recap", DATA_DIR, 2026, 3);
    expect(bundleHash(a)).toMatch(/^[0-9a-f]{16}$/);
    expect(bundleHash(a)).toBe(bundleHash(b));
    expect(bundleHash({ ...a, facts: { ...a.facts, result: "L" } })).not.toBe(bundleHash(a));
  });
});
