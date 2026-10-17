import { describe, expect, it } from "vitest";

import { byWeekDesc, formatKickoff, recordText, weekSlug } from "../src/index.js";

describe("week helpers", () => {
  it("zero-pads the week slug", () => {
    expect(weekSlug(5)).toBe("week-05");
    expect(weekSlug(18)).toBe("week-18");
  });

  it("sorts newest season then newest week first", () => {
    const weeks = [
      { season: 2025, week: 18 },
      { season: 2026, week: 2 },
      { season: 2026, week: 5 },
    ];
    expect([...weeks].sort(byWeekDesc)).toEqual([
      { season: 2026, week: 5 },
      { season: 2026, week: 2 },
      { season: 2025, week: 18 },
    ]);
  });

  it("renders kickoff in Eastern time", () => {
    expect(formatKickoff("2026-10-11T20:25:00Z")).toBe("Sun, Oct 11, 2026, 4:25 PM EDT");
    expect(formatKickoff("2026-12-13T18:00:00Z")).toBe("Sun, Dec 13, 2026, 1:00 PM EST");
  });

  it("omits the tie column until there is a tie", () => {
    expect(recordText({ w: 5, l: 2, t: 0 })).toBe("5-2");
    expect(recordText({ w: 5, l: 2, t: 1 })).toBe("5-2-1");
  });
});
