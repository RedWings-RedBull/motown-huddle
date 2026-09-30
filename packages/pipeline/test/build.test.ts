import { describe, expect, it } from "vitest";

import { GradeRequest, METRICS, metricsForPool, Slot, type Pool } from "@huddle/shared";

import { NotReadyError } from "../src/errors.js";
import { memoryLogger } from "../src/log.js";
import { buildWeek } from "../src/run.js";
import { validateArtifacts } from "../src/stages/write.js";
import { GAME_ID, loadFixtureInputs, stubEngine } from "./helpers.js";

const GOFF = "00-0033106";
const GIBBS = "00-0039139";
const ST_BROWN = "00-0036963";
const HUTCHINSON = "00-0037236";
const BATES = "00-0039172";
const FOX = "00-0035156";
const SEWELL = "00-0036880";
const SAYLORS = "00-0038896";
const KENNEDY = "00-0035544";
const VAKI = "00-0039364";
const IZIEN = "00-0038820";

describe("buildWeek on the 2026 week 3 fixtures (provisional)", async () => {
  const inputs = await loadFixtureInputs("provisional");
  const log = memoryLogger();
  const { request, artifacts } = buildWeek(inputs, stubEngine, log);
  const player = (id: string) => {
    const row = request.players.find((p) => p.gsisId === id);
    if (!row) throw new Error(`missing player ${id}`);
    return row;
  };

  it("produces a valid GradeRequest for the configured game", () => {
    expect(() => GradeRequest.parse(request)).not.toThrow();
    expect(request.gameId).toBe(GAME_ID);
    expect(request.team).toBe("DET");
    expect(request.tier).toBe("provisional");
    expect(request.units.map((u) => u.team)).toEqual([
      "ATL",
      "CIN",
      "DET",
      "GB",
      "MIN",
      "NYJ",
      "PIT",
      "TB",
    ]);
  });

  it("emits exactly the provisional metric keys of each pool, never PFR keys", () => {
    const seen = new Set<Pool>();
    for (const p of request.players) {
      seen.add(p.pool);
      const expected = metricsForPool(p.pool)
        .filter((d) => d.tier === "provisional")
        .map((d) => d.key)
        .sort();
      expect(Object.keys(p.values).sort()).toEqual(expected);
      expect(Object.keys(p.samples).sort()).toEqual(expected);
    }
    for (const u of request.units) {
      expect(Object.keys(u.values).sort()).toEqual(
        metricsForPool("OL")
          .filter((d) => d.tier === "provisional")
          .map((d) => d.key)
          .sort(),
      );
    }
    expect([...seen].sort()).toEqual([...new Set(METRICS.map((d) => d.pool))].sort());
  });

  it("credits the quarterback from play-by-play", () => {
    const goff = player(GOFF);
    expect(goff.pool).toBe("QB");
    expect(goff.n).toBe(36);
    expect(goff.snaps).toBe(65);
    expect(goff.values["qb.epaPerDropback"]).not.toBeNull();
    expect(goff.samples["qb.epaPerDropback"]).toBe(36);
    expect(goff.values["qb.ngsCpoe"]).not.toBeNull();
    expect(goff.values["qb.badThrowPct"]).toBeUndefined();
  });

  it("uses NGS when present and pbp fallbacks otherwise", () => {
    const gibbs = player(GIBBS);
    expect(gibbs.pool).toBe("RB");
    expect(gibbs.values["rb.ryoePerAtt"]).not.toBeNull();
    const amon = player(ST_BROWN);
    expect(amon.pool).toBe("WR");
    expect(amon.values["wr.targetShare"]).toBeGreaterThan(0);
    expect(amon.samples["wr.yardsPerEstRoute"]).toBeGreaterThan(0);
    const noNgs = request.players.find(
      (p) =>
        p.pool === "WR" &&
        p.team === "DET" &&
        p.gsisId !== ST_BROWN &&
        (p.values["wr.yacOverExpected"] ?? null) !== null,
    );
    expect(noNgs).toBeDefined();
  });

  it("classifies defenders by depth-chart slot with 3-4 awareness", () => {
    expect(player(HUTCHINSON).pool).toBe("EDGE");
    const watt = player("00-0033886");
    expect(watt.pool).toBe("EDGE");
    const heyward = player("00-0027969");
    expect(heyward.pool).toBe("IDL");
  });

  it("grades specialists and lists linemen as OL identity rows", () => {
    expect(player(BATES).pool).toBe("K");
    expect(player(BATES).values["k.fgPointsOverExpected"]).toBeCloseTo(3 - 3 * 0.965, 3);
    expect(player(FOX).pool).toBe("P");
    expect(player(FOX).values["p.netAvg"]).toBeGreaterThan(30);
    expect(player(SEWELL).pool).toBe("OL");
    expect(player(SEWELL).values["ol.sackRate"]).toBeNull();
  });

  it("grades the players who actually returned kicks as returners and tiles them on KR/PR", () => {
    // Saylors (listed RB3, no carries) fielded both DET kickoff returns; Kennedy took one kickoff
    // and one punt. Vaki (RB, 6 carries) and Martin (WR) are chart-listed returners with zero
    // returns and never appear on the return tiles.
    const saylors = player(SAYLORS);
    expect(saylors.pool).toBe("RET");
    expect(saylors.n).toBe(2);
    expect(saylors.snaps).toBe(15);
    expect(saylors.values["ret.returnEpa"]).toBeCloseTo(2.2, 1);
    expect(saylors.values["ret.yardsPerReturn"]).toBe(40.5);
    expect(player(KENNEDY).pool).toBe("RET");
    expect(player(VAKI).pool).toBe("RB");
    const at = (slot: string) =>
      request.assignments.filter((a) => a.slot === slot).map((a) => a.gsisId);
    expect(at("KR")).toEqual([SAYLORS, KENNEDY]);
    expect(at("PR")).toEqual([KENNEDY]);
    // Saylors keeps his two-snap RB listing (the tile shows who took the snaps) but, pooled as a
    // returner, his grade no longer paints the RB tile.
    expect(at("RB")).toEqual([GIBBS, VAKI, SAYLORS]);
  });

  it("grades a safety listed as a nickel back in the safety pool", () => {
    const izien = player(IZIEN);
    expect(izien.pool).toBe("S");
    expect(izien.position).toBe("NB");
    expect(Object.keys(izien.values).every((k) => k.startsWith("s."))).toBe(true);
  });

  it("fills the 27 slots with every DET participant at most once per unit", () => {
    const slots = new Set(request.assignments.map((a) => a.slot));
    // No listed strong safety took a snap in this game; Izien (listed NB1, snap position DB)
    // took those snaps and is rebalanced onto S1, so every tile has an occupant.
    const missing = Slot.options.filter((s) => !slots.has(s));
    expect(missing).toEqual([]);
    expect(request.assignments.find((a) => a.slot === "S1")?.gsisId).toBe("00-0038820");
    const lt = request.assignments.filter((a) => a.slot === "LT");
    expect(lt[0]?.gsisId).toBe(SEWELL);
    const perUnit = new Map<string, number>();
    for (const a of request.assignments) {
      if (a.slot === "KR" || a.slot === "PR") continue;
      const key = `${a.unit}:${a.gsisId}`;
      perUnit.set(key, (perUnit.get(key) ?? 0) + 1);
    }
    expect([...perUnit.values()].every((n) => n === 1)).toBe(true);
  });

  it("builds artifacts that validate against the shared contract", () => {
    expect(() => validateArtifacts(artifacts)).not.toThrow();
    expect(artifacts.game.home).toEqual({ team: "DET", score: 31 });
    expect(artifacts.game.away).toEqual({ team: "NYJ", score: 24 });
    expect(artifacts.game.team).toEqual({ side: "home", opponent: "NYJ", result: "W" });
    expect(artifacts.game.kickoffUtc).toBe("2026-09-27T17:00:00Z");
    expect(artifacts.game.line.total).toBe(49.5);
    expect(artifacts.meta.gradesVersion).toBe("stub-0");
    expect(artifacts.meta.sources.pbp).toBeDefined();
    const last = artifacts.winProbability.points.at(-1);
    expect(last?.teamWp).toBeGreaterThan(0.95);
    expect(last?.teamScore).toBe(31);
    expect(artifacts.keyPlays.plays.length).toBeLessThanOrEqual(12);
    expect(artifacts.keyPlays.plays.length).toBeGreaterThanOrEqual(8);
    expect(artifacts.teamMetrics.team.epaPerPlay.leagueRank).toBeLessThanOrEqual(8);
    expect(artifacts.grades.olUnit.gapHeat.map((g) => g.zone)).toEqual([
      "LT",
      "LG",
      "C",
      "RG",
      "RT",
    ]);
  });

  it("logs what was extracted", () => {
    expect(log.lines.some((l) => l.includes("slot assignments"))).toBe(true);
  });
});

describe("buildWeek final tier", async () => {
  const inputs = await loadFixtureInputs("final");

  it("adds PFR-backed metrics when the advanced stats are in", () => {
    const { request } = buildWeek(inputs, stubEngine);
    const goff = request.players.find((p) => p.gsisId === GOFF);
    expect(goff?.values["qb.badThrowPct"]).toBeCloseTo(0.129, 3);
    const hutch = request.players.find((p) => p.gsisId === HUTCHINSON);
    expect(Object.keys(hutch?.values ?? {})).toContain("edge.pressureRate");
    const det = request.units.find((u) => u.team === "DET");
    expect(det?.values["ol.pressureRateAllowed"]).not.toBeNull();
    expect(det?.values["ol.yardsBeforeContact"]).not.toBeNull();
    const cb = request.players.find((p) => p.gsisId === "00-0038125");
    expect(cb?.pool).toBe("CB");
    expect(cb?.values["cb.passerRatingAllowed"]).toBe(158.3);
    // The four coverage metrics carry targets as their sample (the engine neutralises them
    // below 3), and yards allowed are per estimated coverage snap, like ball production.
    for (const key of [
      "cb.yardsPerCoverageSnap",
      "cb.passerRatingAllowed",
      "cb.completionPctAllowed",
      "cb.tdAllowed",
    ]) {
      expect(cb?.samples[key]).toBe(7);
    }
    expect(cb?.samples["cb.ballProduction"]).toBe(47);
    expect(cb?.values["cb.yardsPerCoverageSnap"]).toBeCloseTo(98 / 46.72, 2);
    expect(cb?.values["cb.yardsPerCoverageSnap"]).toBeGreaterThan(98 / 64);
    // Goff's four PFR "carries" (kneels and scrambles) stay out of the line's yards before contact.
    expect(det?.values["ol.yardsBeforeContact"]).toBeCloseTo(85 / 26, 9);
    expect(det?.samples["ol.yardsBeforeContact"]).toBe(26);
  });

  it("refuses a Final with partial PFR files", () => {
    const partial = {
      ...inputs,
      pfr: inputs.pfr && { ...inputs.pfr, def: inputs.pfr.def.slice(0, 5) },
    };
    expect(() => buildWeek(partial, stubEngine)).toThrow(NotReadyError);
  });
});
