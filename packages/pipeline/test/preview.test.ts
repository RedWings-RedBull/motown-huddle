import { describe, expect, it } from "vitest";

import { GamesRow, InjuryRow } from "../src/columns.js";
import { parseCsvText } from "../src/csv.js";
import { buildPreview, nextGame } from "../src/preview/build.js";
import { loadFixtureInputs } from "./helpers.js";

const GAMES_CSV = `game_id,season,game_type,week,gameday,gametime,away_team,home_team,away_score,home_score,result,total,overtime,spread_line,total_line,roof,surface,temp,wind,stadium,away_rest,home_rest,div_game,away_qb_name,home_qb_name,away_coach,home_coach,referee
2026_03_NYJ_DET,2026,REG,3,2026-09-27,13:00,NYJ,DET,24,31,7,55,0,7,49.5,dome,fieldturf,NA,NA,Ford Field,7,7,0,Justin Fields,Jared Goff,Aaron Glenn,Dan Campbell,Shawn Hochuli
2026_04_DET_CAR,2026,REG,4,2026-10-04,20:20,DET,CAR,NA,NA,NA,NA,NA,-3.5,50.5,outdoors,grass,72,5,Bank of America Stadium,7,7,0,Jared Goff,Bryce Young,Dan Campbell,Dave Canales,NA
2026_05_DET_ARI,2026,REG,5,2026-10-12,16:05,DET,ARI,NA,NA,NA,NA,NA,-2.5,52.5,dome,grass,NA,NA,State Farm Stadium,8,7,0,Jared Goff,Kyler Murray,Dan Campbell,Jonathan Gannon,NA
2024_02_DET_CAR,2024,REG,2,2024-09-15,13:00,DET,CAR,20,28,8,48,0,-1,46,outdoors,grass,80,4,Bank of America Stadium,7,7,0,Jared Goff,Andy Dalton,Dan Campbell,Dave Canales,NA
2023_06_CAR_DET,2023,REG,6,2023-10-08,13:00,CAR,DET,24,42,18,66,0,10,45,dome,fieldturf,NA,NA,Ford Field,7,7,0,Bryce Young,Jared Goff,Frank Reich,Dan Campbell,NA
`;

const INJURY_CSV = `season,team,week,gsis_id,full_name,position,report_primary_injury,report_status,practice_status
2026,DET,4,00-0037239,Aidan Hutchinson,DE,Knee,Out,Did Not Participate In Practice
2026,CAR,4,00-0039150,Bryce Young,QB,,,Full Participation in Practice
2026,NYJ,4,00-0036355,Someone Else,WR,Hamstring,Questionable,Limited
2026,DET,3,00-0033106,Jared Goff,QB,Ankle,Questionable,Limited
`;

describe("nextGame", () => {
  it("picks the first kickoff after now and skips the bye", async () => {
    const games = await parseCsvText(GAMES_CSV, { schema: GamesRow, label: "games" });
    const next = nextGame(games, "DET", 2026, new Date("2026-09-30T12:00:00Z"));
    expect(next?.game_id).toBe("2026_04_DET_CAR");
    const after = nextGame(games, "DET", 2026, new Date("2026-10-06T12:00:00Z"));
    expect(after?.game_id).toBe("2026_05_DET_ARI");
    expect(nextGame(games, "DET", 2026, new Date("2026-12-01T12:00:00Z"))).toBeNull();
  });
});

describe("buildPreview", () => {
  it("builds the matchup from the team's perspective with splits, injuries and history", async () => {
    const games = await parseCsvText(GAMES_CSV, { schema: GamesRow, label: "games" });
    const injuries = await parseCsvText(INJURY_CSV, { schema: InjuryRow, label: "injuries" });
    const { pbp } = await loadFixtureInputs();
    const preview = buildPreview({
      games,
      pbp,
      injuries,
      team: "DET",
      season: 2026,
      now: new Date("2026-09-30T12:00:00Z"),
    });
    expect(preview).not.toBeNull();
    if (!preview) return;

    expect(preview.gameId).toBe("2026_04_DET_CAR");
    expect(preview.isHome).toBe(false);
    expect(preview.kickoffUtc).toBe("2026-10-05T00:20:00Z");
    expect(preview.line).toEqual({ spread: -3.5, total: 50.5 });
    expect(preview.quarterbacks).toEqual({ team: "Jared Goff", opponent: "Bryce Young" });
    expect(preview.rest).toEqual({ team: 7, opponent: 7 });
    expect(preview.team.record).toEqual({ w: 1, l: 0, t: 0 });
    expect(preview.throughWeek).toBe(3);
    expect(preview.team.offense.epaPerPlay.n).toBeGreaterThan(0);
    expect(preview.team.defense.epaPerPlay.leagueRank).toBeGreaterThanOrEqual(1);
    expect(preview.team.defense.epaPerPlay.leagueRank).toBeLessThanOrEqual(32);
    expect(preview.keyMatchups).toHaveLength(6);
    expect(preview.injuries.map((i) => i.name)).toEqual(["Bryce Young", "Aidan Hutchinson"]);
    expect(preview.lastMeetings.map((m) => `${m.season}:${m.result}`)).toEqual([
      "2024:L",
      "2023:W",
    ]);
  });

  it("returns null when no game is left", async () => {
    const games = await parseCsvText(GAMES_CSV, { schema: GamesRow, label: "games" });
    expect(
      buildPreview({
        games,
        pbp: [],
        injuries: [],
        team: "DET",
        season: 2026,
        now: new Date("2027-01-01"),
      }),
    ).toBeNull();
  });
});
