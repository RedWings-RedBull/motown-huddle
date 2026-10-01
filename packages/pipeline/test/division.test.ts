import { describe, expect, it } from "vitest";

import { GamesRow } from "../src/columns.js";
import { parseCsvText } from "../src/csv.js";
import { buildDivision } from "../src/division/build.js";
import {
  homeWinProbability,
  mulberry32,
  normalCdf,
  simulateSeason,
} from "../src/division/simulate.js";
import { computeRecords, type PlayedGame, streak } from "../src/division/standings.js";
import { rankTeams } from "../src/division/tiebreak.js";
import { loadFixtureInputs } from "./helpers.js";

const g = (week: number, home: string, away: string, hs: number, as: number): PlayedGame => ({
  week,
  home,
  away,
  homeScore: hs,
  awayScore: as,
});

describe("computeRecords", () => {
  it("tallies overall, division and conference records in order", () => {
    const records = computeRecords([
      g(2, "DET", "GB", 24, 20),
      g(1, "DET", "KC", 10, 17),
      g(3, "DET", "CHI", 20, 20),
    ]);
    const det = records.get("DET");
    expect(det).toMatchObject({ w: 1, l: 1, t: 1, pointsFor: 54, pointsAgainst: 57 });
    expect(det?.division).toEqual({ w: 1, l: 0, t: 1 });
    expect(det?.conference).toEqual({ w: 1, l: 0, t: 1 });
    expect(det?.games.map((x) => x.week)).toEqual([1, 2, 3]);
    const gb = records.get("GB");
    expect(det && streak(det)).toBe("T1");
    expect(gb && streak(gb)).toBe("L1");
  });
});

describe("rankTeams", () => {
  const NORTH = ["CHI", "DET", "GB", "MIN"];

  it("orders by winning percentage without a tiebreak when records differ", () => {
    const records = computeRecords(
      [
        g(1, "DET", "KC", 20, 10),
        g(1, "MIN", "CHI", 20, 10),
        g(2, "DET", "GB", 20, 10),
        g(2, "GB", "CHI", 20, 10),
        g(2, "MIN", "KC", 10, 20),
        g(3, "GB", "KC", 10, 20),
      ],
      NORTH,
    );
    const ranked = rankTeams(NORTH, records);
    expect(ranked.map((r) => r.team)).toEqual(["DET", "MIN", "GB", "CHI"]);
    expect(ranked.every((r) => r.resolvedBy === null)).toBe(true);
  });

  it("breaks a two-club tie on head-to-head", () => {
    const records = computeRecords(
      [
        g(1, "DET", "GB", 30, 10),
        g(2, "GB", "CHI", 20, 3),
        g(2, "DET", "MIN", 3, 20),
        g(3, "CHI", "MIN", 1, 2),
      ],
      NORTH,
    );
    const ranked = rankTeams(NORTH, records);
    expect(ranked.map((r) => r.team)).toEqual(["MIN", "DET", "GB", "CHI"]);
    expect(ranked[0]?.resolvedBy).toBeNull();
    expect(ranked[1]?.resolvedBy).toBe("head-to-head");
    expect(ranked[2]?.resolvedBy).toBe("head-to-head");
  });

  it("falls through head-to-head to division record when the clubs split", () => {
    const records = computeRecords(
      [
        g(1, "DET", "GB", 30, 10),
        g(2, "GB", "DET", 30, 10),
        g(3, "DET", "CHI", 20, 10),
        g(3, "GB", "KC", 20, 10),
        g(4, "DET", "MIN", 1, 3),
        g(4, "GB", "MIN", 1, 3),
      ],
      NORTH,
    );
    const ranked = rankTeams(["DET", "GB"], records);
    expect(ranked.map((r) => r.team)).toEqual(["DET", "GB"]);
    expect(ranked[0]?.resolvedBy).toBe("division record");
  });

  it("restarts from step one after a three-club group is split", () => {
    // DET, GB, CHI all 2-1. Head-to-head among the three: DET beat GB, GB beat CHI, CHI beat DET → all 1-1.
    // Division record: DET 1-1, GB 1-1, CHI 2-1 (CHI also beat MIN) → CHI first; DET/GB restart at head-to-head.
    const records = computeRecords(
      [
        g(1, "DET", "GB", 20, 10),
        g(2, "GB", "CHI", 20, 10),
        g(3, "CHI", "DET", 20, 10),
        g(4, "CHI", "MIN", 20, 10),
        g(4, "DET", "KC", 20, 10),
        g(4, "GB", "KC", 20, 10),
        g(5, "MIN", "KC", 1, 2),
      ],
      NORTH,
    );
    const ranked = rankTeams(["CHI", "DET", "GB"], records);
    expect(ranked.map((r) => r.team)).toEqual(["CHI", "DET", "GB"]);
    expect(ranked[0]?.resolvedBy).toBe("division record");
    expect(ranked[1]?.resolvedBy).toBe("head-to-head");
  });

  it("uses the alphabetical placeholder when nothing separates the clubs", () => {
    const records = computeRecords([], ["DET", "GB"]);
    const ranked = rankTeams(["GB", "DET"], records);
    expect(ranked.map((r) => r.team)).toEqual(["DET", "GB"]);
    expect(ranked[0]?.resolvedBy).toContain("coin toss");
  });
});

describe("simulate", () => {
  it("has a deterministic generator and a sane normal CDF", () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(normalCdf(-1.96)).toBeCloseTo(0.025, 3);
  });

  it("uses the spread when present, else ratings with a home edge", () => {
    const rating = new Map([
      ["DET", 6],
      ["CHI", -6],
    ]);
    const base = { week: 5, home: "DET", away: "CHI", homeScore: null, awayScore: null };
    expect(homeWinProbability({ ...base, spreadLine: 7 }, rating)).toBeCloseTo(
      normalCdf(7 / 13.86),
      9,
    );
    expect(homeWinProbability({ ...base, spreadLine: null }, rating)).toBeCloseTo(
      normalCdf(14 / 13.86),
      9,
    );
    expect(
      homeWinProbability({ ...base, home: "CHI", away: "DET", spreadLine: null }, rating),
    ).toBeLessThan(0.5);
  });

  it("produces shares that sum to one across the division and win distributions", () => {
    const games = [
      { week: 1, home: "DET", away: "GB", homeScore: 20, awayScore: 10, spreadLine: 3 },
      { week: 2, home: "CHI", away: "MIN", homeScore: null, awayScore: null, spreadLine: -3 },
      { week: 2, home: "DET", away: "CHI", homeScore: null, awayScore: null, spreadLine: null },
      { week: 3, home: "GB", away: "MIN", homeScore: null, awayScore: null, spreadLine: 1 },
    ];
    const out = simulateSeason({ games, runs: 400, seed: 1, teams: ["CHI", "DET", "GB", "MIN"] });
    expect(out.reduce((s, t) => s + t.division, 0)).toBeCloseTo(1, 9);
    for (const t of out) {
      expect(t.winDistribution.reduce((s, x) => s + x, 0)).toBeCloseTo(1, 9);
      expect(t.playoffs).toBeGreaterThanOrEqual(t.division);
    }
    const again = simulateSeason({ games, runs: 400, seed: 1, teams: ["DET"] });
    expect(again[0]).toEqual(out.find((t) => t.team === "DET"));
  });
});

const GAMES_CSV = `game_id,season,game_type,week,gameday,gametime,away_team,home_team,away_score,home_score,result,total,overtime,spread_line,total_line,roof,surface,temp,wind,stadium,away_rest,home_rest,div_game,away_qb_name,home_qb_name,away_coach,home_coach,referee
2026_01_GB_DET,2026,REG,1,2026-09-13,13:00,GB,DET,20,27,7,47,0,3,48,dome,fieldturf,NA,NA,Ford Field,7,7,1,A,B,C,D,E
2026_01_MIN_CHI,2026,REG,1,2026-09-13,13:00,MIN,CHI,24,10,-14,34,0,-1,44,outdoors,grass,70,5,Soldier Field,7,7,1,A,B,C,D,E
2026_02_DET_CHI,2026,REG,2,2026-09-20,13:00,DET,CHI,NA,NA,NA,NA,NA,-3,46,outdoors,grass,NA,NA,Soldier Field,7,7,1,A,B,C,D,E
2026_02_GB_MIN,2026,REG,2,2026-09-20,16:25,GB,MIN,NA,NA,NA,NA,NA,2,47,dome,fieldturf,NA,NA,U.S. Bank Stadium,7,7,1,A,B,C,D,E
2026_03_DET_KC,2026,REG,3,2026-09-27,20:20,DET,KC,NA,NA,NA,NA,NA,NA,NA,outdoors,grass,NA,NA,Arrowhead,7,7,0,A,B,C,D,E
`;

describe("buildDivision", () => {
  it("assembles standings, odds, profiles and upcoming games", async () => {
    const games = await parseCsvText(GAMES_CSV, { schema: GamesRow, label: "games" });
    const { pbp } = await loadFixtureInputs();
    const file = buildDivision({ games, pbp, team: "DET", season: 2026, runs: 200, seed: 3 });
    expect(file.division).toBe("NFC North");
    expect(file.conference).toBe("NFC");
    expect(file.throughWeek).toBe(1);
    // MIN and DET are both 1-0 with identical records down to net points (+14 vs +7).
    expect(file.standings.map((s) => s.team)).toEqual(["MIN", "DET", "GB", "CHI"]);
    expect(file.standings[0]).toMatchObject({ w: 1, l: 0, streak: "W1", lastFive: ["W"], rank: 1 });
    expect(file.standings[1]?.resolvedBy).toBe("net points");
    expect(file.odds.map((o) => o.team)).toEqual(["CHI", "DET", "GB", "MIN"]);
    expect(file.simulation).toEqual({ runs: 200, seed: 3, gamesRemaining: 3 });
    expect(file.profiles).toHaveLength(4);
    expect(file.upcoming.map((u) => u.gameId)).toEqual(["2026_02_DET_CHI", "2026_02_GB_MIN"]);
    expect(file.upcoming[0]?.divGame).toBe(true);
  });
});
