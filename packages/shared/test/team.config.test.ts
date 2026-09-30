import { describe, expect, it } from "vitest";

import { Pool, Slot, WeekId, teamConfig } from "../src/index.js";

describe("teamConfig", () => {
  it("uses a three-letter nflverse team code", () => {
    expect(teamConfig.team).toMatch(/^[A-Z]{2,3}$/);
  });

  it("never embeds a team mark in the brand", () => {
    expect(teamConfig.siteName.toLowerCase()).not.toContain("lions");
    expect(teamConfig.siteName.toLowerCase()).not.toContain("den");
  });

  it("carries the non-affiliation disclaimer and data attribution", () => {
    expect(teamConfig.disclaimer).toMatch(/Unofficial fan site/);
    expect(teamConfig.attribution).toMatch(/nflverse/);
  });
});

describe("schemas", () => {
  it("defines the 27 field slots", () => {
    expect(Slot.options).toHaveLength(27);
  });

  it("grades OL as a unit pool alongside per-player pools", () => {
    expect(Pool.options).toContain("OL");
    expect(Pool.options).toContain("EDGE");
  });

  it("accepts a real nflverse game id and rejects a malformed one", () => {
    expect(WeekId.safeParse({ season: 2026, week: 3, gameId: "2026_03_NYJ_DET" }).success).toBe(
      true,
    );
    expect(WeekId.safeParse({ season: 2026, week: 3, gameId: "nyj-det" }).success).toBe(false);
  });
});
