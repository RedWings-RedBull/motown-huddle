import {
  GradeRequest,
  Grades,
  LeagueBaselines,
  metricsForPool,
  Pool,
  Slot,
  type SlotGrade,
} from "@huddle/shared";
import { describe, expect, it } from "vitest";

import { GRADES_VERSION, gradeWeek, shrink, snapWeightedMean, unitForPool } from "../src/index.js";
import { buildLeague, findPlayer, playerId, TEAM, TEAMS } from "./fixtures/league.js";

const id = (pool: Pool, i: number) => playerId(TEAM, pool, i);

function slotOf(grades: Grades, slot: Slot): SlotGrade {
  const found = grades.slots.find((s) => s.slot === slot);
  if (!found) throw new Error(`no slot ${slot}`);
  return found;
}

function firstPlayer(grades: Grades, slot: Slot) {
  const p = slotOf(grades, slot).players[0];
  if (!p) throw new Error(`slot ${slot} is empty`);
  return p;
}

function component(grades: Grades, slot: Slot, key: string) {
  const c = firstPlayer(grades, slot).components.find((x) => x.key === key);
  if (!c) throw new Error(`no component ${key} in slot ${slot}`);
  return c;
}

/** Mid-rank percentile of a unique extreme in a pool of 32: 100 - 0.5 / 32 * 100. */
const BEST_OF_32 = 98.4375;

describe("gradeWeek", () => {
  it("exports a semver GRADES_VERSION", () => {
    expect(GRADES_VERSION).toBe("1.1.0");
  });

  it("produces artifacts that satisfy the shared schemas in both tiers", () => {
    for (const tier of ["provisional", "final"] as const) {
      const request = GradeRequest.parse(buildLeague(tier));
      const { grades, baselines } = gradeWeek(request);
      expect(() => Grades.parse(grades)).not.toThrow();
      expect(() => LeagueBaselines.parse(baselines)).not.toThrow();
      expect(grades).toMatchObject({ season: 2026, week: 3, gameId: "2026_03_NYJ_DET", tier });
      expect(baselines).toMatchObject({ season: 2026, week: 3, tier });
    }
  });

  it("is deterministic and leaves the request untouched", () => {
    const request = buildLeague("final");
    const first = gradeWeek(request);
    const second = gradeWeek(request);
    expect(second).toEqual(first);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(request).toEqual(buildLeague("final"));
    expect(gradeWeek(buildLeague("final"))).toEqual(first);
  });

  it("inverts percentiles for lower-is-better metrics", () => {
    const request = buildLeague("final");
    const qb = findPlayer(request, id("QB", 0));
    qb.values["qb.sackRate"] = -1; // lowest sack rate in the league
    qb.values["qb.epaPerDropback"] = 99; // highest EPA in the league
    const { grades } = gradeWeek(request);
    const sack = component(grades, "QB", "qb.sackRate");
    expect(sack.direction).toBe("lower");
    expect(sack.percentile).toBe(BEST_OF_32);
    expect(sack.poolN).toBe(32);
    expect(component(grades, "QB", "qb.epaPerDropback").percentile).toBe(BEST_OF_32);
    expect(component(grades, "QB", "qb.turnoverWorthyRate")).toMatchObject({
      label: "Turnover-worthy play rate",
      source: "ftn",
      unit: "pct",
      weight: 0.1,
      n: qb.n,
    });
  });

  it("drops final-tier metrics in provisional and renormalises the weights", () => {
    const request = buildLeague("provisional");
    const qb = findPlayer(request, id("QB", 0));
    for (const def of metricsForPool("QB")) {
      qb.values[def.key] = def.direction === "higher" ? 999 : -999;
    }
    const { grades } = gradeWeek(request);
    const player = firstPlayer(grades, "QB");
    const keys = player.components.map((c) => c.key);
    expect(keys).toHaveLength(6);
    expect(keys).not.toContain("qb.badThrowPct");
    // Every present percentile is BEST_OF_32; without renormalisation the composite would be
    // 0.9 * BEST_OF_32 because the 10% bad-throw weight is absent.
    expect(player.grade.rawComposite).toBeCloseTo(BEST_OF_32, 9);

    const final = gradeWeek(buildLeague("final")).grades;
    expect(firstPlayer(final, "QB").components.map((c) => c.key)).toContain("qb.badThrowPct");
  });

  it("renormalises around a component whose value is missing for the player", () => {
    const request = buildLeague("final");
    const qb = findPlayer(request, id("QB", 0));
    for (const def of metricsForPool("QB")) {
      qb.values[def.key] = def.direction === "higher" ? 999 : -999;
    }
    qb.values["qb.ngsCpoe"] = null;
    const { grades } = gradeWeek(request);
    const ngs = component(grades, "QB", "qb.ngsCpoe");
    expect(ngs.value).toBeNull();
    expect(ngs.percentile).toBeNull();
    expect(ngs.poolN).toBe(31);
    expect(firstPlayer(grades, "QB").grade.rawComposite).toBeCloseTo(BEST_OF_32, 9);
  });

  it("shrinks the composite toward 50 by n / (n + k)", () => {
    const request = buildLeague("final");
    const qb = findPlayer(request, id("QB", 0));
    qb.n = 30;
    const { grades } = gradeWeek(request);
    const { grade } = firstPlayer(grades, "QB");
    expect(grade.rawComposite).not.toBeNull();
    const raw = grade.rawComposite ?? 0;
    expect(grade.k).toBe(15);
    expect(grade.n).toBe(30);
    expect(grade.value).toBeCloseTo(shrink(raw, 30, 15), 12);
    expect(grade.value).toBeCloseTo(50 + (raw - 50) * (30 / 45), 12);
    expect(Math.abs((grade.value ?? 0) - 50)).toBeLessThan(Math.abs(raw - 50));
    expect(grade.qualified).toBe(true);
    expect(grade.reason).toBeNull();

    qb.n = 3000;
    const far = firstPlayer(gradeWeek(request).grades, "QB").grade;
    expect(Math.abs((far.value ?? 0) - (far.rawComposite ?? 0))).toBeLessThan(
      Math.abs((grade.value ?? 0) - raw),
    );
  });

  it("rejects players below the pool threshold with the spec's reason", () => {
    const request = buildLeague("final");
    findPlayer(request, id("RB", 1)).n = 3;
    const { grades } = gradeWeek(request);
    const rb = slotOf(grades, "RB");
    const bench = rb.players.find((p) => p.gsisId === id("RB", 1));
    expect(bench?.grade).toMatchObject({
      value: null,
      bin: "na",
      qualified: false,
      reason: "below 6 carries or 8 touches",
      n: 3,
      k: 8,
    });
    expect(bench?.components).toHaveLength(5);
    expect(grades.pools.RB).toEqual({ n: 63, threshold: "6 carries or 8 touches" });
    expect(grades.pools.QB).toEqual({ n: 32, threshold: "14 dropbacks" });
    // The rejected back does not drag the tile: it equals the starter's grade.
    expect(rb.tileGrade).toBe(rb.players[0]?.grade.value);
  });

  it("qualifies a receiver on 15 offensive snaps with fewer than 3 targets, shrinking on targets", () => {
    const request = buildLeague("final");
    const wr = findPlayer(request, id("WR", 2));
    wr.n = 2;
    wr.snaps = 20;
    const { grades } = gradeWeek(request);
    const player = firstPlayer(grades, "WR3");
    expect(player.grade.qualified).toBe(true);
    expect(player.grade.reason).toBeNull();
    expect(player.grade.value).not.toBeNull();
    expect(player.grade.value).toBeCloseTo(shrink(player.grade.rawComposite ?? 0, 2, 5), 12);
    expect(grades.pools.WR.threshold).toBe("3 targets or 15 offensive snaps");

    wr.snaps = 14;
    expect(firstPlayer(gradeWeek(request).grades, "WR3").grade).toMatchObject({
      value: null,
      bin: "na",
      qualified: false,
      reason: "below 3 targets or 15 offensive snaps",
    });

    // A receiver who ran routes all game without a target is neutral, not the league's best.
    wr.n = 0;
    wr.snaps = 60;
    const untargeted = firstPlayer(gradeWeek(request).grades, "WR3").grade;
    expect(untargeted.qualified).toBe(true);
    expect(untargeted.value).toBe(50);
  });

  it("neutralises CB and S coverage metrics below 3 targets instead of dropping them", () => {
    const keys = [
      "cb.yardsPerCoverageSnap",
      "cb.passerRatingAllowed",
      "cb.completionPctAllowed",
      "cb.tdAllowed",
    ];
    const request = buildLeague("final");
    const cb = findPlayer(request, id("CB", 0));
    for (const key of keys) {
      cb.values[key] = -999; // would be the league's best if it counted
      cb.samples[key] = 2;
    }
    const { grades } = gradeWeek(request);
    for (const key of keys) {
      const c = component(grades, "CB_L", key);
      expect(c.value).toBe(-999);
      expect(c.percentile).toBe(50);
      expect(c.n).toBe(2);
      // He also leaves the metric's league population (96 corners minus himself).
      expect(c.poolN).toBe(95);
    }
    const ball = component(grades, "CB_L", "cb.ballProduction");
    const missed = component(grades, "CB_L", "cb.missedTacklePct");
    expect(ball.percentile).not.toBeNull();
    expect(missed.percentile).not.toBeNull();
    expect(firstPlayer(grades, "CB_L").grade.rawComposite).toBeCloseTo(
      50 * 0.75 + (ball.percentile ?? 0) * 0.15 + (missed.percentile ?? 0) * 0.1,
      9,
    );

    // At exactly 3 targets the real percentile is used again.
    for (const key of keys) cb.samples[key] = 3;
    const rated = component(gradeWeek(request).grades, "CB_L", "cb.yardsPerCoverageSnap");
    expect(rated.percentile).toBeCloseTo(100 - 50 / 96, 9);
    expect(rated.poolN).toBe(96);

    // Safeties follow the same rule; a missing value is still dropped rather than neutralised.
    const safety = findPlayer(request, id("S", 0));
    safety.values["s.tdAllowed"] = null;
    safety.samples["s.tdAllowed"] = 1;
    safety.values["s.passerRatingAllowed"] = 12;
    safety.samples["s.passerRatingAllowed"] = 1;
    const s1 = gradeWeek(request).grades;
    expect(component(s1, "S1", "s.tdAllowed")).toMatchObject({ value: null, percentile: null });
    expect(component(s1, "S1", "s.passerRatingAllowed")).toMatchObject({
      value: 12,
      percentile: 50,
    });
  });

  it("reports a corner whose PFR row is missing in the final tier instead of grading ball production alone", () => {
    const request = buildLeague("final");
    const cb = findPlayer(request, id("CB", 0));
    for (const def of metricsForPool("CB")) if (def.source === "pfr") cb.values[def.key] = null;
    const { grades } = gradeWeek(request);
    const { grade, components } = firstPlayer(grades, "CB_L");
    expect(grade).toMatchObject({
      value: null,
      bin: "na",
      qualified: true,
      reason: "PFR row missing",
    });
    expect(grade.rawComposite).not.toBeNull();
    expect(components.filter((c) => c.value !== null).map((c) => c.key)).toEqual([
      "cb.ballProduction",
    ]);
    // One PFR value is enough to grade (the rest renormalise away).
    cb.values["cb.missedTacklePct"] = 5;
    expect(firstPlayer(gradeWeek(request).grades, "CB_L").grade.reason).toBeNull();
  });

  it("marks CB and S as PFR pending in the provisional tier and grades them in final", () => {
    const provisional = gradeWeek(buildLeague("provisional")).grades;
    for (const slot of ["CB_L", "CB_R", "NB", "S1", "S2"] as const) {
      const { grade, components } = firstPlayer(provisional, slot);
      expect(grade).toMatchObject({
        value: null,
        bin: "na",
        qualified: true,
        reason: "PFR pending",
      });
      expect(grade.rawComposite).not.toBeNull();
      expect(components.map((c) => c.key)).toEqual([
        `${slot.startsWith("S") ? "s" : "cb"}.ballProduction`,
      ]);
      expect(slotOf(provisional, slot)).toMatchObject({ tileGrade: null, bin: "na" });
    }
    const final = gradeWeek(buildLeague("final")).grades;
    const cb = firstPlayer(final, "CB_L");
    expect(cb.grade.value).not.toBeNull();
    expect(cb.grade.reason).toBeNull();
    expect(cb.components).toHaveLength(6);
    expect(slotOf(final, "CB_L").bin).not.toBe("na");
  });

  it("only counts LB coverage when the player was targeted at least twice", () => {
    const request = buildLeague("final");
    const lb1 = findPlayer(request, id("LB", 0));
    const lb2 = findPlayer(request, id("LB", 1));
    lb1.values["lb.coverage"] = 0.5;
    lb1.samples["lb.coverage"] = 1;
    lb2.values["lb.coverage"] = 0.5;
    lb2.samples["lb.coverage"] = 2;
    const { grades } = gradeWeek(request);
    expect(component(grades, "LB1", "lb.coverage")).toMatchObject({
      value: null,
      percentile: null,
      n: 1,
    });
    expect(component(grades, "LB2", "lb.coverage")).toMatchObject({ value: 0.5, n: 2 });
    expect(component(grades, "LB2", "lb.coverage").percentile).not.toBeNull();
  });

  it("grades the offensive line as a unit and propagates it to all five OL tiles", () => {
    const request = buildLeague("final");
    const { grades } = gradeWeek(request);
    const { olUnit } = grades;
    expect(olUnit.grade.k).toBe(0);
    expect(olUnit.grade.qualified).toBe(true);
    expect(olUnit.grade.value).toBe(olUnit.grade.rawComposite);
    expect(olUnit.components.map((c) => c.key).sort()).toEqual(
      metricsForPool("OL")
        .map((d) => d.key)
        .sort(),
    );
    expect(olUnit.components.every((c) => c.poolN === 32 && c.n === 60)).toBe(true);
    expect(olUnit.gapHeat).toEqual(request.gapHeat);
    expect(grades.pools.OL).toEqual({ n: 32, threshold: "all 32 units" });
    for (const slot of ["LT", "LG", "C", "RG", "RT"] as const) {
      const tile = slotOf(grades, slot);
      expect(tile.unitOnly).toBe(true);
      expect(tile.unit).toBe("offense");
      expect(tile.tileGrade).toBe(olUnit.grade.value);
      expect(tile.bin).toBe(olUnit.grade.bin);
      expect(tile.players).toHaveLength(1);
      expect(tile.players[0]?.pool).toBe("OL");
      expect(tile.players[0]?.grade).toMatchObject({
        value: null,
        bin: "na",
        reason: "unit grade only",
      });
      expect(tile.players[0]?.components).toEqual([]);
    }
    expect(slotOf(grades, "LT").players[0]?.penalties).toEqual([
      { type: "Offensive Holding", yards: 10 },
    ]);
    expect(slotOf(grades, "QB").unitOnly).toBe(false);

    const provisional = gradeWeek(buildLeague("provisional")).grades.olUnit;
    expect(provisional.components.map((c) => c.key)).toEqual([
      "ol.sackRate",
      "ol.protectionVsFour",
      "ol.stuffRate",
      "ol.adjustedLineYards",
    ]);
  });

  it("reports a missing unit row without inventing a grade", () => {
    const request = buildLeague("final");
    request.units = request.units.filter((u) => u.team !== TEAM);
    const { grades } = gradeWeek(request);
    expect(grades.olUnit.grade).toMatchObject({
      value: null,
      bin: "na",
      qualified: false,
      reason: "no unit data",
    });
    expect(grades.olUnit.components).toEqual([]);
    expect(grades.pools.OL.n).toBe(31);
    expect(slotOf(grades, "LT")).toMatchObject({ tileGrade: null, bin: "na" });
    expect(slotOf(grades, "LT").players).toHaveLength(1);
  });

  it("stacks players in a slot by snaps and colours the tile by snap-weighted grade", () => {
    const { grades } = gradeWeek(buildLeague("final"));
    const rb = slotOf(grades, "RB");
    expect(rb.players.map((p) => p.gsisId)).toEqual([id("RB", 0), id("RB", 1)]);
    expect(rb.players.map((p) => p.snaps)).toEqual([40, 20]);
    expect(rb.players.map((p) => p.snapPct)).toEqual([0.67, 0.33]);
    expect(rb.tileGrade).toBe(
      snapWeightedMean(rb.players.map((p) => ({ grade: p.grade.value, snaps: p.snaps }))),
    );
    expect(rb.tileGrade).not.toBe(rb.players[0]?.grade.value);
    expect(rb.label).toBe("Running back");
    // Ties on snaps fall back to snap share, then id, so the order is stable.
    const request = buildLeague("final");
    for (const a of request.assignments) if (a.slot === "RB") a.snaps = 30;
    const tied = slotOf(gradeWeek(request).grades, "RB");
    expect(tied.players.map((p) => p.gsisId)).toEqual([id("RB", 0), id("RB", 1)]);
  });

  it("never lets a scrimmage grade paint a return tile", () => {
    expect(unitForPool("RB")).toBe("offense");
    expect(unitForPool("CB")).toBe("defense");
    expect(unitForPool("RET")).toBe("st");
    const request = buildLeague("final");
    request.assignments.push({
      slot: "KR",
      unit: "st",
      gsisId: id("RB", 0),
      snaps: 10,
      snapPct: 0.4,
    });
    const { grades } = gradeWeek(request);
    const kr = slotOf(grades, "KR");
    // The back is still listed (he took the snaps) with his own rushing grade ...
    expect(kr.players.map((p) => p.gsisId)).toEqual([id("RB", 0), id("RET", 0)]);
    expect(kr.players[0]?.pool).toBe("RB");
    expect(kr.players[0]?.grade.value).not.toBeNull();
    // ... but the tile is the returner's grade alone, not a 10:3 blend.
    expect(kr.tileGrade).toBe(kr.players[1]?.grade.value);
    expect(kr.tileGrade).not.toBe(
      snapWeightedMean(kr.players.map((p) => ({ grade: p.grade.value, snaps: p.snaps }))),
    );

    // Only scrimmage players on the tile: no return grade is fabricated.
    const only = buildLeague("final");
    only.assignments = only.assignments.filter((a) => a.slot !== "KR");
    only.assignments.push({ slot: "KR", unit: "st", gsisId: id("RB", 0), snaps: 10, snapPct: 0.4 });
    const tile = slotOf(gradeWeek(only).grades, "KR");
    expect(tile.players).toHaveLength(1);
    expect(tile).toMatchObject({ tileGrade: null, bin: "na" });
  });

  it("emits all 27 slots in field order, including empty ones", () => {
    const request = buildLeague("final");
    request.assignments.push({
      slot: "LS",
      unit: "st",
      gsisId: "unknown-id",
      snaps: 5,
      snapPct: 0.2,
    });
    const { grades } = gradeWeek(request);
    expect(grades.slots.map((s) => s.slot)).toEqual([...Slot.options]);
    expect(slotOf(grades, "LS")).toEqual({
      slot: "LS",
      unit: "st",
      label: "Long snapper",
      tileGrade: null,
      bin: "na",
      unitOnly: false,
      players: [],
    });
    const kr = slotOf(grades, "KR");
    const pr = slotOf(grades, "PR");
    expect(kr.players[0]?.gsisId).toBe(id("RET", 0));
    expect(pr.players[0]?.gsisId).toBe(id("RET", 0));
    expect(kr.players[0]?.snaps).toBe(3);
    expect(pr.players[0]?.snaps).toBe(2);
    expect(kr.players[0]?.grade).toEqual(pr.players[0]?.grade);
    // Only the requested team's players are ever placed on the field.
    for (const slot of grades.slots) {
      for (const p of slot.players) expect(p.gsisId.startsWith(`${TEAM}-`)).toBe(true);
    }
  });

  it("never grades the long snapper, whatever pool the pipeline filed him under", () => {
    const request = buildLeague("final");
    // No LS pool exists, so the pipeline emits long snappers under P; the tile must not
    // read "below 1 punt" and must not carry punting components.
    request.assignments.push({
      slot: "LS",
      unit: "st",
      gsisId: id("P", 0),
      snaps: 7,
      snapPct: 0.3,
    });
    const { grades } = gradeWeek(request);
    const ls = slotOf(grades, "LS");
    expect(ls.tileGrade).toBeNull();
    expect(ls.bin).toBe("na");
    expect(ls.players).toHaveLength(1);
    expect(ls.players[0]).toMatchObject({
      gsisId: id("P", 0),
      snaps: 7,
      snapPct: 0.3,
      components: [],
      grade: {
        value: null,
        bin: "na",
        rawComposite: null,
        n: 0,
        k: 0,
        qualified: false,
        reason: "long snappers are not graded",
      },
    });
    // The same player keeps his real grade on the P tile.
    expect(firstPlayer(grades, "P").grade.value).not.toBeNull();
  });

  it("flags a qualified player with no metric inputs", () => {
    const request = buildLeague("final");
    const punter = findPlayer(request, id("P", 0));
    for (const key of Object.keys(punter.values)) punter.values[key] = null;
    const { grades } = gradeWeek(request);
    expect(firstPlayer(grades, "P").grade).toMatchObject({
      value: null,
      bin: "na",
      rawComposite: null,
      qualified: true,
      reason: "no metric inputs",
    });
    expect(grades.pools.P.n).toBe(32);
  });

  it("summarises the population with interpolated quantiles", () => {
    const request = buildLeague("final");
    TEAMS.forEach((team, i) => {
      findPlayer(request, playerId(team, "K", 0)).values["k.xpRate"] = i / 31;
    });
    const { baselines } = gradeWeek(request);
    const xp = baselines.pools.K["k.xpRate"];
    expect(xp?.n).toBe(32);
    expect(xp?.p10).toBeCloseTo(0.1, 12);
    expect(xp?.p25).toBeCloseTo(0.25, 12);
    expect(xp?.p50).toBeCloseTo(0.5, 12);
    expect(xp?.p75).toBeCloseTo(0.75, 12);
    expect(xp?.p90).toBeCloseTo(0.9, 12);
    expect(Object.keys(baselines.pools).sort()).toEqual([...Pool.options].sort());
    expect(Object.keys(baselines.pools.QB)).toContain("qb.badThrowPct");
    expect(baselines.pools.OL["ol.sackRate"]?.n).toBe(32);
    for (const pool of Object.values(baselines.pools)) {
      for (const s of Object.values(pool)) {
        expect(s.p10).toBeLessThanOrEqual(s.p25);
        expect(s.p25).toBeLessThanOrEqual(s.p50);
        expect(s.p50).toBeLessThanOrEqual(s.p75);
        expect(s.p75).toBeLessThanOrEqual(s.p90);
      }
    }
  });

  it("omits final-tier and empty metrics from the baselines", () => {
    const request = buildLeague("provisional");
    for (const p of request.players) if (p.pool === "QB") p.values["qb.ngsCpoe"] = null;
    const { baselines, grades } = gradeWeek(request);
    expect(Object.keys(baselines.pools.QB).sort()).toEqual([
      "qb.cpoe",
      "qb.epaPerDropback",
      "qb.sackRate",
      "qb.successRate",
      "qb.turnoverWorthyRate",
    ]);
    expect(component(grades, "QB", "qb.ngsCpoe")).toMatchObject({ percentile: null, poolN: 0 });
    // A single-kicker population still yields finite quantiles (all equal to that value).
    const solo = buildLeague("final");
    solo.players = solo.players.filter((p) => p.pool !== "K" || p.team === TEAM);
    findPlayer(solo, id("K", 0)).values["k.xpRate"] = 0.75;
    const xp = gradeWeek(solo).baselines.pools.K["k.xpRate"];
    expect(xp).toEqual({ n: 1, p10: 0.75, p25: 0.75, p50: 0.75, p75: 0.75, p90: 0.75 });
  });
});
