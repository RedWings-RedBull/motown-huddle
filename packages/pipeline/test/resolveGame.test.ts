import { describe, expect, it } from "vitest";

import { GamesRow, forSeason } from "../src/columns.js";
import { readCsv } from "../src/csv.js";
import {
  isFinal,
  resolveLatest,
  resolveWeek,
  toResolvedGame,
  weekKickoffs,
} from "../src/stages/resolveGame.js";
import { fixture } from "./helpers.js";

const games = await readCsv(fixture("games.csv"), { schema: GamesRow, keep: forSeason(2026) });

describe("resolveWeek", () => {
  it("returns the team's row for an explicit week", () => {
    const game = resolveWeek(games, "DET", 2026, 3);
    expect(game?.gameId).toBe("2026_03_NYJ_DET");
    expect(game?.side).toBe("home");
    expect(game?.opponent).toBe("NYJ");
    expect(game?.kickoffUtc).toBe("2026-09-27T17:00:00Z");
    const away = resolveWeek(games, "DET", 2026, 2);
    expect(away?.side).toBe("away");
    expect(away?.opponent).toBe("BUF");
  });

  it("returns null on the bye week", () => {
    expect(resolveWeek(games, "DET", 2026, 6)).toBeNull();
    expect(resolveWeek(games, "DET", 2025, 3)).toBeNull();
  });
});

describe("resolveLatest (--week auto)", () => {
  it("picks the latest completed game before now", () => {
    const now = new Date("2026-09-30T13:00:00Z");
    expect(resolveLatest(games, "DET", 2026, now)?.week).toBe(3);
  });

  it("skips games that have kicked off but have no final score yet", () => {
    const now = new Date("2026-10-05T03:00:00Z");
    expect(resolveLatest(games, "DET", 2026, now)?.week).toBe(3);
  });

  it("ignores games whose kickoff is still in the future even if a score exists", () => {
    const now = new Date("2026-09-27T16:59:00Z");
    expect(resolveLatest(games, "DET", 2026, now)?.week).toBe(2);
  });

  it("returns null before the first completed game", () => {
    expect(resolveLatest(games, "DET", 2026, new Date("2026-09-01T00:00:00Z"))).toBeNull();
  });
});

describe("helpers", () => {
  it("isFinal reads the posted total", () => {
    const week3 = games.find((g) => g.game_id === "2026_03_NYJ_DET");
    const week4 = games.find((g) => g.game_id === "2026_04_DET_CAR");
    expect(week3 && isFinal(week3)).toBe(true);
    expect(week4 && isFinal(week4)).toBe(false);
  });

  it("weekKickoffs maps every team of the week to its kickoff", () => {
    const kickoffs = weekKickoffs(games, 2026, 3);
    expect(kickoffs.get("DET")).toBe("2026-09-27T17:00:00Z");
    expect(kickoffs.get("GB")).toBe("2026-09-25T00:15:00Z");
    expect(kickoffs.size).toBe(8);
  });

  it("toResolvedGame derives the side", () => {
    const row = games.find((g) => g.game_id === "2026_03_ATL_GB");
    expect(row && toResolvedGame("GB", row).side).toBe("home");
  });
});
