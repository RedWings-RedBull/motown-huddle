import { describe, expect, it } from "vitest";

import { GamesRow, PbpRow } from "../src/columns.js";
import { buildCoach } from "../src/coach/build.js";
import { currentCoach, eraRecord } from "../src/coach/era.js";
import { aggressionIndex, fourthDownPlays } from "../src/coach/fourthDown.js";
import { buildTables, secondsInQuarter } from "../src/coach/tables.js";
import { parseCsvText } from "../src/csv.js";
import { loadFixtureInputs } from "./helpers.js";

const GAMES_CSV = `game_id,season,game_type,week,gameday,gametime,away_team,home_team,away_score,home_score,result,total,overtime,spread_line,total_line,roof,surface,temp,wind,stadium,away_rest,home_rest,div_game,away_qb_name,home_qb_name,away_coach,home_coach,referee
2025_01_DET_GB,2025,REG,1,2025-09-07,16:25,DET,GB,13,27,14,40,0,2,47.5,outdoors,grass,70,5,Lambeau Field,7,7,1,A,B,Dan Campbell,Matt LaFleur,E
2025_19_DET_SF,2025,POST,19,2026-01-11,16:30,DET,SF,24,27,3,51,0,3,50,outdoors,grass,60,4,Levi's Stadium,7,7,0,A,B,Dan Campbell,Kyle Shanahan,E
2026_01_NO_DET,2026,REG,1,2026-09-13,13:00,NO,DET,30,31,1,61,1,7,49.5,dome,fieldturf,NA,NA,Ford Field,7,7,0,A,B,Kellen Moore,Dan Campbell,E
2026_03_NYJ_DET,2026,REG,3,2026-09-27,13:00,NYJ,DET,24,31,7,55,0,7,49.5,dome,fieldturf,NA,NA,Ford Field,7,7,0,A,B,Aaron Glenn,Dan Campbell,E
2026_04_DET_CAR,2026,REG,4,2026-10-04,20:20,DET,CAR,NA,NA,NA,NA,NA,-3.5,50.5,outdoors,grass,72,5,Bank of America Stadium,7,7,0,A,B,Dan Campbell,Dave Canales,E
`;

const NOW = new Date("2026-09-30T12:00:00Z");

describe("era", () => {
  it("identifies the current coach and splits the era record", async () => {
    const games = await parseCsvText(GAMES_CSV, { schema: GamesRow, label: "games" });
    expect(currentCoach(games, "DET", NOW)).toBe("Dan Campbell");
    expect(currentCoach(games, "DET", new Date("2020-01-01"))).toBeNull();
    const era = eraRecord(games, "DET", "Dan Campbell");
    expect(era.map((e) => e.season)).toEqual([2025, 2026]);
    expect(era[0]).toMatchObject({
      regular: { w: 0, l: 1, t: 0 },
      postseason: { w: 0, l: 1, t: 0 },
      away: { w: 0, l: 2, t: 0 },
      oneScore: { w: 0, l: 1, t: 0 },
      underdog: { w: 0, l: 2, t: 0 },
      division: { w: 0, l: 1, t: 0 },
    });
    expect(era[1]).toMatchObject({
      regular: { w: 2, l: 0, t: 0 },
      home: { w: 2, l: 0, t: 0 },
      favorite: { w: 2, l: 0, t: 0 },
    });
  });
});

describe("fourth downs", () => {
  it("classifies decisions, flags forced ones, and scores the index per team", async () => {
    const { pbp } = await loadFixtureInputs();
    const plays = fourthDownPlays(pbp);
    expect(plays.length).toBeGreaterThan(0);
    expect(new Set(plays.map((p) => p.decision))).toEqual(new Set(["go", "punt", "fg"]));
    for (const p of plays) {
      expect(p.forced).toBe(p.qtr >= 4 && p.secondsRemaining <= 240 && p.scoreDiff < 0);
    }
    const index = aggressionIndex(plays);
    const ranks = [...index.values()].map((a) => a.rank).sort((a, b) => a - b);
    expect(ranks).toEqual(ranks.map((_, i) => i + 1));
    const total = [...index.values()].reduce((s, a) => s + a.decisions, 0);
    expect(total).toBe(plays.filter((p) => !p.forced).length);
  });

  it("builds smoothed tables from play-by-play", async () => {
    const { pbp } = await loadFixtureInputs();
    const t = buildTables(pbp);
    for (const d of Object.values(t.conversion)) {
      for (const cell of Object.values(d)) {
        expect(cell.rate).toBeGreaterThan(0);
        expect(cell.rate).toBeLessThan(1);
      }
    }
    expect(t.fieldGoal).toHaveLength(10);
    expect(t.punt).toHaveLength(7);
    expect(t.winProbability).toHaveLength(4);
    expect(secondsInQuarter(1, 3600)).toBe(900);
    expect(secondsInQuarter(4, 120)).toBe(120);
    expect(secondsInQuarter(2, 1850)).toBe(50);
    expect(secondsInQuarter(5, 400)).toBe(400);
  });
});

describe("buildCoach", () => {
  it("assembles the coach file for the current season", async () => {
    const games = await parseCsvText(GAMES_CSV, { schema: GamesRow, label: "games" });
    const { pbp } = await loadFixtureInputs();
    const file = buildCoach({ games, pbp, team: "DET", season: 2026, now: NOW });
    expect(file.coach).toBe("Dan Campbell");
    expect(file.firstSeason).toBe(2025);
    expect(file.throughWeek).toBe(3);
    expect(file.tableSeasons).toEqual([2026]);
    expect(file.index.map((i) => i.season)).toEqual([2026]);
    expect(file.log.length).toBeGreaterThan(0);
    expect(file.log.every((e) => e.gameId === "2026_03_NYJ_DET")).toBe(true);
    expect(file.log.every((e) => ["go", "punt", "fg"].includes(e.calc.recommended))).toBe(true);
  });

  it("fails loudly without a completed game", async () => {
    const games = await parseCsvText(GAMES_CSV, { schema: GamesRow, label: "games" });
    const rows = await parseCsvText("", { schema: PbpRow, label: "pbp" }).catch(() => []);
    expect(() =>
      buildCoach({ games, pbp: rows, team: "DET", season: 2026, now: new Date("2019-01-01") }),
    ).toThrow(/head coach/);
  });
});
