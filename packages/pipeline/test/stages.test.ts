import { describe, expect, it } from "vitest";

import type { PbpRow } from "../src/columns.js";
import { ValidationError } from "../src/errors.js";
import { bucketFor, fgMakeProbability } from "../src/models/fgTable.js";
import {
  indexFtn,
  isDesignedRush,
  isExplosive,
  isKneel,
  ratio,
  sum,
} from "../src/stages/context.js";
import {
  accumulatePlays,
  adjustedLineYards,
  extract,
  restrictToTier,
} from "../src/stages/extract.js";
import { gameSummary } from "../src/stages/gameSummary.js";
import { gapHeat, zoneFor } from "../src/stages/gapHeat.js";
import { keyPlays, tagsFor } from "../src/stages/keyPlays.js";
import { leaguePercentile, offenseTotals, teamMetrics } from "../src/stages/teamMetrics.js";
import { winProbability } from "../src/stages/winProbability.js";
import { GAME_ID, loadFixtureInputs } from "./helpers.js";

const inputs = await loadFixtureInputs("provisional");
const game = inputs.pbp.filter((p) => p.game_id === GAME_ID);

/** A minimal play with every nullable column null; override what the test needs. */
function play(overrides: Partial<PbpRow>): PbpRow {
  const base: Record<string, unknown> = {};
  for (const key of Object.keys(game[0] ?? {})) base[key] = null;
  return {
    ...(base as unknown as PbpRow),
    play_id: 1,
    game_id: "g",
    season: 2026,
    week: 3,
    home_team: "DET",
    away_team: "NYJ",
    ...overrides,
  };
}

describe("fg make table", () => {
  it("buckets by five yards and clamps outside the fitted range", () => {
    expect(bucketFor(18)).toBe(15);
    expect(bucketFor(47)).toBe(45);
    expect(fgMakeProbability(30)).toBeCloseTo(0.965, 3);
    // Chip shots pool with the 20-24 bucket, so a shorter kick never earns more points over expected.
    expect(fgMakeProbability(10)).toBeCloseTo(0.9904, 3);
    expect(fgMakeProbability(18)).toBe(fgMakeProbability(22));
    expect(fgMakeProbability(80)).toBeCloseTo(0.3333, 3);
    for (let d = 25; d <= 70; d += 5) {
      expect(fgMakeProbability(d)).toBeLessThanOrEqual(fgMakeProbability(d - 5));
    }
    const sparse = {
      version: 1,
      fittedOn: "",
      smoothing: "",
      bucketSize: 5,
      buckets: [
        { from: 20, to: 24, att: 1, made: 1, p: 0.9 },
        { from: 40, to: 44, att: 1, made: 1, p: 0.5 },
      ],
    };
    expect(fgMakeProbability(31, sparse)).toBe(0.9);
    expect(() => fgMakeProbability(31, { ...sparse, buckets: [] })).toThrow(/empty/);
  });
});

describe("context helpers", () => {
  it("never counts a kneel-down as a designed rush", () => {
    const kneel = play({ rush_attempt: 1, posteam: "DET", play_type: "qb_kneel", qb_kneel: 1 });
    expect(isKneel(kneel)).toBe(true);
    expect(isDesignedRush(kneel)).toBe(false);
    // Either signal alone is enough (the fixture slice predates the qb_kneel column).
    expect(isDesignedRush(play({ rush_attempt: 1, posteam: "DET", qb_kneel: 1 }))).toBe(false);
    expect(
      isDesignedRush(
        play({ rush_attempt: 1, posteam: "DET", play_type: "qb_kneel", qb_kneel: null }),
      ),
    ).toBe(false);
    expect(isDesignedRush(play({ rush_attempt: 1, posteam: "DET", play_type: "run" }))).toBe(true);
    expect(isDesignedRush(play({ rush_attempt: 1, posteam: "DET", qb_scramble: 1 }))).toBe(false);
    const acc = accumulatePlays(
      [kneel, { ...kneel, rusher_player_id: "qb", yards_gained: -1 }],
      indexFtn([]),
    );
    expect(acc.get("qb")).toBeUndefined();
  });

  it("computes ratios, sums and explosive plays", () => {
    expect(ratio(1, 0)).toBeNull();
    expect(ratio(1, 4)).toBe(0.25);
    expect(sum([1, null, 2])).toBe(3);
    expect(isExplosive(play({ pass_attempt: 1, yards_gained: 20 }))).toBe(true);
    expect(isExplosive(play({ pass_attempt: 1, sack: 1, yards_gained: 20 }))).toBe(false);
    expect(isExplosive(play({ rush_attempt: 1, yards_gained: 9 }))).toBe(false);
    expect(isExplosive(play({ punt_attempt: 1, yards_gained: 50 }))).toBe(false);
  });
});

describe("accumulatePlays specialists", () => {
  it("credits kicks, punts and returns from both kickoff and punt perspectives", () => {
    const plays = [
      play({
        play_id: 1,
        field_goal_attempt: 1,
        field_goal_result: "made",
        kick_distance: 30,
        kicker_player_id: "k",
      }),
      play({
        play_id: 2,
        field_goal_attempt: 1,
        field_goal_result: "blocked",
        kick_distance: 52,
        kicker_player_id: "k",
      }),
      play({
        play_id: 3,
        extra_point_attempt: 1,
        extra_point_result: "good",
        kicker_player_id: "k",
      }),
      play({
        play_id: 4,
        extra_point_attempt: 1,
        extra_point_result: "failed",
        kicker_player_id: "k",
      }),
      play({ play_id: 5, kickoff_attempt: 1, touchback: 1, kicker_player_id: "k" }),
      play({
        play_id: 6,
        kickoff_attempt: 1,
        touchback: 1,
        penalty_type: "Kickoff Short of Landing Zone",
        kicker_player_id: "k",
      }),
      play({
        play_id: 7,
        kickoff_attempt: 1,
        touchback: 0,
        kicker_player_id: "k",
        kickoff_returner_player_id: "r",
        return_yards: 30,
        epa: 0.5,
      }),
      play({
        play_id: 8,
        punt_attempt: 1,
        punter_player_id: "p",
        epa: -0.4,
        punt_returner_player_id: "r",
        return_yards: 10,
      }),
      play({
        play_id: 9,
        punt_attempt: 1,
        punter_player_id: "p",
        epa: 0.2,
        punt_returner_player_id: "r",
        punt_fair_catch: 1,
      }),
      play({
        play_id: 10,
        kickoff_attempt: 1,
        touchback: 0,
        kickoff_returner_player_id: "r",
        kickoff_fair_catch: 1,
      }),
      play({
        play_id: 11,
        penalty: 1,
        penalty_player_id: "r",
        penalty_type: "Offensive Holding",
        penalty_yards: 10,
      }),
      play({ play_id: 12, penalty: 1, penalty_player_id: "r", penalty_yards: null }),
    ];
    const acc = accumulatePlays(plays, indexFtn([]));
    const k = acc.get("k");
    expect(k?.fgAtt).toBe(2);
    expect(k?.fgPoe).toBeCloseTo(3 - 3 * 0.965 - 3 * 0.7366, 3);
    expect(k?.xpAtt).toBe(2);
    expect(k?.xpMade).toBe(1);
    expect(k?.kickoffs).toBe(3);
    expect(k?.touchbacks).toBe(1);
    const p = acc.get("p");
    expect(p?.punts).toBe(2);
    expect(p?.puntEpa).toBeCloseTo(-0.2, 6);
    const r = acc.get("r");
    expect(r?.returns).toBe(2);
    expect(r?.returnEpa).toBeCloseTo(0.5 + 0.4, 6);
    expect(r?.returnYards).toBe(40);
    expect(r?.penalties).toEqual([
      { type: "Offensive Holding", yards: 10 },
      { type: "Penalty", yards: 0 },
    ]);
  });

  it("applies FTN charting to sacks, interception-worthy throws, drops and contested catches", () => {
    const plays = [
      play({
        play_id: 1,
        game_id: "g",
        qb_dropback: 1,
        posteam: "DET",
        passer_player_id: "qb",
        sack: 1,
        qb_epa: -1,
      }),
      play({
        play_id: 2,
        game_id: "g",
        qb_dropback: 1,
        posteam: "DET",
        passer_player_id: "qb",
        sack: 1,
        qb_epa: -1,
      }),
      play({
        play_id: 3,
        game_id: "g",
        qb_dropback: 1,
        posteam: "DET",
        passer_player_id: "qb",
        pass_attempt: 1,
        receiver_player_id: "wr",
        complete_pass: 0,
        cp: 0.6,
        cpoe: -60,
        qb_epa: -0.5,
        success: 0,
      }),
      play({
        play_id: 4,
        game_id: "g",
        qb_dropback: 1,
        posteam: "DET",
        passer_player_id: "qb",
        pass_attempt: 1,
        receiver_player_id: "wr",
        complete_pass: 1,
        cp: 0.4,
        cpoe: 60,
        qb_epa: 2,
        success: 1,
        yac_epa: 1,
        xyac_epa: 0.5,
      }),
      play({
        play_id: 5,
        game_id: "g",
        qb_dropback: 1,
        posteam: "DET",
        qb_scramble: 1,
        rush_attempt: 1,
        rusher_player_id: "qb",
        fumble_lost: 1,
        fumbled_1_player_id: "qb",
        qb_epa: -3,
        success: 0,
      }),
    ];
    const ftn = indexFtn([
      {
        nflverse_game_id: "g",
        nflverse_play_id: 1,
        season: 2026,
        week: 3,
        is_qb_fault_sack: false,
        is_interception_worthy: null,
        is_drop: null,
        is_catchable_ball: null,
        is_contested_ball: null,
        is_created_reception: null,
        n_pass_rushers: 4,
        n_blitzers: 0,
      },
      {
        nflverse_game_id: "g",
        nflverse_play_id: 3,
        season: 2026,
        week: 3,
        is_qb_fault_sack: null,
        is_interception_worthy: true,
        is_drop: true,
        is_catchable_ball: true,
        is_contested_ball: true,
        is_created_reception: false,
        n_pass_rushers: 5,
        n_blitzers: 1,
      },
      {
        nflverse_game_id: "g",
        nflverse_play_id: 4,
        season: 2026,
        week: 3,
        is_qb_fault_sack: null,
        is_interception_worthy: false,
        is_drop: false,
        is_catchable_ball: true,
        is_contested_ball: true,
        is_created_reception: true,
        n_pass_rushers: 4,
        n_blitzers: 0,
      },
    ]);
    const acc = accumulatePlays(plays, ftn);
    const qb = acc.get("qb");
    expect(qb?.dropbacks).toBe(5);
    expect(qb?.qbSacks).toBe(1);
    expect(qb?.intWorthy).toBe(1);
    expect(qb?.fumblesLost).toBe(1);
    expect(qb?.cpoeN).toBe(2);
    expect(qb?.cpoe).toBe(0);
    expect(qb?.qbEpa).toBeCloseTo(-3.5, 6);
    const wr = acc.get("wr");
    expect(wr?.targets).toBe(2);
    expect(wr?.croe).toBeCloseTo(-0.6 + 0.6, 6);
    expect(wr?.catchable).toBe(2);
    expect(wr?.drops).toBe(1);
    expect(wr?.contested).toBe(2);
    expect(wr?.contestedCaught).toBe(1);
    expect(wr?.yacOe).toBeCloseTo(0.5, 6);
  });

  it("credits run stops to every tackler on an unsuccessful designed run", () => {
    const plays = [
      play({
        play_id: 1,
        rush_attempt: 1,
        posteam: "DET",
        rusher_player_id: "rb",
        success: 0,
        yards_gained: 1,
        solo_tackle_1_player_id: "d1",
        assist_tackle_1_player_id: "d2",
        assist_tackle_2_player_id: "d2",
      }),
      play({
        play_id: 2,
        rush_attempt: 1,
        posteam: "DET",
        rusher_player_id: "rb",
        success: 1,
        yards_gained: 12,
        solo_tackle_1_player_id: "d1",
      }),
      play({
        play_id: 3,
        pass_attempt: 1,
        posteam: "DET",
        pass_defense_1_player_id: "d3",
        interception: 1,
        interception_player_id: "d4",
        receiver_player_id: "wr",
      }),
    ];
    const acc = accumulatePlays(plays, indexFtn([]));
    expect(acc.get("d1")?.runStops).toBe(1);
    expect(acc.get("d2")?.runStops).toBe(1);
    expect(acc.get("d3")?.pbus).toBe(1);
    expect(acc.get("d4")?.ints).toBe(1);
    expect(acc.get("rb")?.carries).toBe(2);
    expect(acc.get("rb")?.explosiveRuns).toBe(1);
  });
});

describe("extract on the fixture week", () => {
  it("keeps Goff's two kneel-downs out of the DET rushes, stuffs, line yards and gap heat", () => {
    const kneels = game.filter((p) => p.play_type === "qb_kneel");
    expect(kneels).toHaveLength(2);
    expect(kneels.every((p) => p.rush_attempt === 1 && p.qb_kneel === 1)).toBe(true);
    const { units, contexts } = extract(inputs);
    const det = units.find((u) => u.team === "DET");
    expect(contexts.get("DET")?.designedRushes).toBe(26);
    expect(det?.samples["ol.stuffRate"]).toBe(26);
    expect(det?.values["ol.stuffRate"]).toBeCloseTo(3 / 26, 9);
    expect(det?.values["ol.adjustedLineYards"]).toBeCloseTo(3.7077, 3);
    expect(gapHeat(inputs.pbp, GAME_ID, "DET").reduce((n, h) => n + h.n, 0)).toBe(26);
    const totals = offenseTotals(inputs.pbp).get("DET");
    expect(totals?.rushes).toBe(26);
    expect(totals?.explosiveDen).toBe(totals?.plays);
    expect(totals?.rushEpa).toBeGreaterThan(0);
  });

  it("applies the 6-carry-or-8-touch rule through n", () => {
    const withGibbs = (carries: number, receptions: number) => {
      const stats = inputs.stats.map((s) =>
        s.player_id === "00-0039139" ? { ...s, carries, receptions } : s,
      );
      const row = extract({ ...inputs, stats }).players.find((p) => p.gsisId === "00-0039139");
      if (!row) throw new Error("no Gibbs");
      return row;
    };
    expect(withGibbs(3, 3).n).toBe(3); // 6 touches do not qualify
    expect(withGibbs(2, 6).n).toBe(8); // 8 touches do, on touches
    expect(withGibbs(6, 0).n).toBe(6); // 6 carries do, on carries
    expect(withGibbs(7, 9).n).toBe(7); // carries win when they qualify on their own
  });

  it("drops EPA components when the weekly stats row is missing instead of scoring 0", () => {
    const stats = inputs.stats.filter((s) => s.player_id !== "00-0036963");
    const amon = extract({ ...inputs, stats }).players.find((p) => p.gsisId === "00-0036963");
    expect(amon?.pool).toBe("WR");
    expect(amon?.samples["wr.recEpaPerTarget"]).toBeGreaterThan(0);
    expect(amon?.values["wr.recEpaPerTarget"]).toBeNull();
    expect(amon?.values["wr.yardsPerEstRoute"]).toBeNull();
    expect(amon?.values["wr.catchRateOverExpected"]).not.toBeNull();
  });
});

describe("extract helpers", () => {
  it("credits adjusted line yards per the football outsiders scheme", () => {
    expect(adjustedLineYards(-5)).toBe(-6);
    expect(adjustedLineYards(0)).toBe(0);
    expect(adjustedLineYards(4)).toBe(4);
    expect(adjustedLineYards(6)).toBe(5);
    expect(adjustedLineYards(10)).toBe(7);
    expect(adjustedLineYards(40)).toBe(7);
  });

  it("restricts to the pool's keys for the tier", () => {
    const prov = restrictToTier(
      "QB",
      "provisional",
      { "qb.cpoe": 1, "qb.badThrowPct": 2, junk: 3 },
      {},
    );
    expect(Object.keys(prov.values)).not.toContain("qb.badThrowPct");
    expect(Object.keys(prov.values)).not.toContain("junk");
    expect(prov.values["qb.epaPerDropback"]).toBeNull();
    expect(prov.samples["qb.cpoe"]).toBe(0);
    const fin = restrictToTier("QB", "final", { "qb.badThrowPct": 2 }, { "qb.badThrowPct": 30 });
    expect(fin.values["qb.badThrowPct"]).toBe(2);
    expect(fin.samples["qb.badThrowPct"]).toBe(30);
  });
});

describe("gapHeat", () => {
  it("maps run_location x run_gap to the five zones", () => {
    expect(zoneFor("left", "end")).toBe("LT");
    expect(zoneFor("left", "tackle")).toBe("LT");
    expect(zoneFor("left", "guard")).toBe("LG");
    expect(zoneFor("left", null)).toBe("LG");
    expect(zoneFor("middle", null)).toBe("C");
    expect(zoneFor("right", "guard")).toBe("RG");
    expect(zoneFor("right", "tackle")).toBe("RT");
    expect(zoneFor("right", null)).toBe("RG");
    expect(zoneFor(null, null)).toBeNull();
  });

  it("aggregates the team's designed runs and always returns all five zones", () => {
    const heat = gapHeat(inputs.pbp, GAME_ID, "DET");
    expect(heat.map((h) => h.zone)).toEqual(["LT", "LG", "C", "RG", "RT"]);
    expect(heat.reduce((n, h) => n + h.n, 0)).toBeGreaterThan(15);
    for (const h of heat) {
      expect(h.successRate).toBeGreaterThanOrEqual(0);
      expect(h.successRate).toBeLessThanOrEqual(1);
    }
    const empty = gapHeat(inputs.pbp, "nope", "DET");
    expect(empty.every((h) => h.n === 0 && h.epaPerRush === 0)).toBe(true);
  });
});

describe("keyPlays", () => {
  it("tags plays", () => {
    expect(
      tagsFor(play({ touchdown: 1, pass_attempt: 1, yards_gained: 45, down: 4, penalty: 1 })),
    ).toEqual(["td", "fourth-down", "explosive", "penalty"]);
    expect(tagsFor(play({ interception: 1, sack: 0 }))).toEqual(["turnover"]);
    expect(tagsFor(play({ sack: 1, field_goal_attempt: 1 }))).toEqual(["sack", "fg"]);
  });

  it("takes the top 8 by |wpa|, adds scoring plays and DET fourth-down decisions, caps at 12", () => {
    const out = keyPlays(inputs.pbp, { season: 2026, week: 3, gameId: GAME_ID, team: "DET" });
    expect(out.plays.length).toBeLessThanOrEqual(12);
    const ids = out.plays.map((p) => p.playId);
    expect([...ids].sort((a, b) => a - b)).toEqual(ids);
    const byWpa = [...game]
      .filter((p) => p.wpa !== null && p.posteam !== null)
      .sort((a, b) => Math.abs(b.wpa ?? 0) - Math.abs(a.wpa ?? 0))
      .slice(0, 8);
    for (const p of byWpa) expect(ids).toContain(p.play_id);
    const fourth = game.filter(
      (p) =>
        p.posteam === "DET" && p.down === 4 && (p.play_type === "pass" || p.play_type === "run"),
    );
    expect(fourth.length).toBe(2);
    // Extras beyond the top 8 are the highest-|wpa| scoring or fourth-down plays; anything left
    // out must have a smaller |wpa| than every extra that made it.
    const extras = out.plays.filter((p) => !byWpa.some((b) => b.play_id === p.playId));
    expect(extras.length).toBe(4);
    const minExtra = Math.min(...extras.map((p) => Math.abs(p.wpa)));
    for (const p of fourth) {
      if (!ids.includes(p.play_id)) expect(Math.abs(p.wpa ?? 0)).toBeLessThanOrEqual(minExtra);
    }
    expect(
      extras.every(
        (p) => p.tags.includes("td") || p.tags.includes("fg") || p.tags.includes("fourth-down"),
      ),
    ).toBe(true);
    const short = keyPlays(game.slice(0, 12), {
      season: 2026,
      week: 3,
      gameId: GAME_ID,
      team: "DET",
    });
    expect(short.plays.length).toBeLessThanOrEqual(12);
    expect(out.plays.every((p) => p.clock.length > 0 && p.qtr >= 1)).toBe(true);
    expect(out.plays.some((p) => p.tags.includes("td"))).toBe(true);
  });

  it("nulls out-of-range yardlines and copes with missing fields", () => {
    const out = keyPlays(
      [
        play({
          play_id: 7,
          wpa: 0.3,
          posteam: "DET",
          yardline_100: 0,
          qtr: null,
          down: 2,
          ydstogo: 7,
          desc: null,
          time: null,
        }),
      ],
      { season: 2026, week: 3, gameId: "g", team: "DET" },
    );
    expect(out.plays[0]).toMatchObject({
      playId: 7,
      yardline100: null,
      qtr: 1,
      clock: "",
      desc: "",
      down: 2,
      ydstogo: 7,
    });
  });
});

describe("winProbability", () => {
  it("flips wp for the opponent's possessions and tracks the score from DET's side", () => {
    const out = winProbability(inputs.pbp, {
      season: 2026,
      week: 3,
      gameId: GAME_ID,
      team: "DET",
      side: "home",
    });
    expect(out.points.length).toBe(game.filter((p) => p.wp !== null && p.posteam !== null).length);
    const kickoff = out.points[0];
    expect(kickoff?.teamWp).toBeCloseTo(1 - 0.4332, 3);
    expect(kickoff?.vegasTeamWp).toBeCloseTo(1 - 0.2306, 3);
    const last = out.points.at(-1);
    expect(last?.teamScore).toBe(31);
    expect(last?.oppScore).toBe(24);
    expect(last?.secondsRemaining).toBeGreaterThanOrEqual(0);
    const away = winProbability(inputs.pbp, {
      season: 2026,
      week: 3,
      gameId: GAME_ID,
      team: "NYJ",
      side: "away",
    });
    expect(away.points[0]?.teamWp).toBeCloseTo(0.4332, 3);
    expect(away.points.at(-1)?.teamScore).toBe(24);
  });

  it("nulls vegas wp when missing and clamps", () => {
    const out = winProbability(
      [
        play({
          play_id: 1,
          game_id: "g",
          posteam: "DET",
          wp: 1.2,
          vegas_wp: null,
          game_seconds_remaining: null,
        }),
      ],
      {
        season: 2026,
        week: 3,
        gameId: "g",
        team: "DET",
        side: "away",
      },
    );
    expect(out.points[0]).toMatchObject({
      teamWp: 1,
      vegasTeamWp: null,
      secondsRemaining: 0,
      teamScore: 0,
    });
  });
});

describe("teamMetrics", () => {
  it("ranks teams with mid-rank percentiles and inverts sack rate", () => {
    expect(leaguePercentile([1, 2, 3, 4], 4, false)).toEqual({ percentile: 87.5, rank: 1 });
    expect(leaguePercentile([1, 2, 3, 4], 1, true)).toEqual({ percentile: 87.5, rank: 1 });
    expect(leaguePercentile([2, 2, 2], 2, false)).toEqual({ percentile: 50, rank: 1 });
    expect(leaguePercentile([], 2, false)).toEqual({ percentile: 50, rank: 1 });
  });

  it("builds both sides with league context and a weighted team grade", () => {
    const out = teamMetrics(inputs.pbp, {
      season: 2026,
      week: 3,
      gameId: GAME_ID,
      tier: "provisional",
      team: "DET",
      opponent: "NYJ",
    });
    expect(out.team.epaPerPlay.n).toBeGreaterThan(50);
    expect(out.team.fourthDown).toEqual({ att: 2, conv: 1 });
    expect(out.opponent.epaPerPlay.leagueRank).toBeGreaterThanOrEqual(1);
    expect(out.team.penalties.count).toBeGreaterThan(0);
    expect(out.teamGrade.overall).toBeCloseTo(
      0.45 * out.teamGrade.offense +
        0.45 * out.teamGrade.defense +
        0.1 * out.teamGrade.specialTeams,
      6,
    );
    expect(out.teamGrade.defense).toBeCloseTo(100 - out.opponent.epaPerPlay.leaguePercentile, 6);
    const totals = offenseTotals(inputs.pbp);
    expect(totals.size).toBe(8);
    expect(totals.get("DET")?.turnovers).toBeGreaterThanOrEqual(0);
  });

  it("handles a team with no plays", () => {
    const out = teamMetrics([], {
      season: 2026,
      week: 3,
      gameId: "g",
      tier: "provisional",
      team: "DET",
      opponent: "NYJ",
    });
    expect(out.team.epaPerPlay).toEqual({ value: 0, leaguePercentile: 50, leagueRank: 1, n: 0 });
  });
});

describe("gameSummary", () => {
  it("throws when the score is not posted", () => {
    const row = { ...inputs.game.row, home_score: null };
    expect(() => gameSummary({ ...inputs.game, row }, "provisional")).toThrow(ValidationError);
  });

  it("derives result, overtime and venue", () => {
    const summary = gameSummary(inputs.game, "final");
    expect(summary.overtime).toBe(false);
    expect(summary.venue.stadium).toBe("Ford Field");
    expect(summary.venue.roof).toBe("dome");
    expect(summary.venue.temp).toBeNull();
    expect(summary.tier).toBe("final");
    const tie = gameSummary(
      {
        ...inputs.game,
        row: {
          ...inputs.game.row,
          home_score: 20,
          away_score: 20,
          overtime: 1,
          stadium: null,
          roof: null,
          surface: null,
        },
      },
      "final",
    );
    expect(tie.team.result).toBe("T");
    expect(tie.overtime).toBe(true);
    expect(tie.venue).toMatchObject({ stadium: "", roof: "", surface: "" });
    const loss = gameSummary(
      { ...inputs.game, side: "away", row: { ...inputs.game.row, home_score: 20, away_score: 10 } },
      "final",
    );
    expect(loss.team.result).toBe("L");
  });
});
