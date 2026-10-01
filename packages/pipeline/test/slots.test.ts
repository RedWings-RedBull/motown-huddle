import { describe, expect, it } from "vitest";

import { DepthChartRow, SnapCountRow } from "../src/columns.js";
import { buildCrosswalk } from "../src/crosswalk.js";
import { readCsv } from "../src/csv.js";
import { depthChartSnapshot } from "../src/stages/context.js";
import {
  classifyPool,
  poolForDepthChart,
  poolForNgsPosition,
  poolForPosition,
} from "../src/stages/pools.js";
import {
  assignSlots,
  fallbackPlacement,
  gameReturners,
  participants,
  placementFor,
  slotOrder,
  type Participant,
} from "../src/stages/slots.js";
import { PbpRow, PlayersRow } from "../src/columns.js";
import { forWeek } from "../src/columns.js";
import { fixture } from "./helpers.js";

const KICKOFF = "2026-09-27T17:00:00Z";

function person(gsisId: string, position: string, offense = 0, defense = 0, st = 0): Participant {
  return {
    gsisId,
    position,
    offense: { snaps: offense, pct: offense / 65 },
    defense: { snaps: defense, pct: defense / 65 },
    st: { snaps: st, pct: st / 23 },
  };
}

function chartRow(
  team: string,
  gsisId: string,
  posAbb: string,
  posGrp: string,
  posRank = 1,
  dt = "2026-09-27T12:56:55Z",
): DepthChartRow {
  return {
    dt,
    team,
    player_name: gsisId,
    gsis_id: gsisId,
    pos_grp: posGrp,
    pos_abb: posAbb,
    pos_rank: posRank,
  };
}

describe("placementFor", () => {
  it("maps 4-3 and 3-4 fronts differently", () => {
    expect(placementFor("LDE", "Base 4-3 D", 1)).toEqual({ slot: "EDGE_L" });
    expect(placementFor("LDE", "Base 3-4 D", 1)).toEqual({ slot: "IDL_L" });
    expect(placementFor("WLB", "Base 4-3 D", 1)).toEqual({ pick: ["LB1", "LB2"] });
    expect(placementFor("WLB", "Base 3-4 D", 1)).toEqual({ slot: "EDGE_L" });
    expect(placementFor("SLB", "Base 3-4 D", 1)).toEqual({ slot: "EDGE_R" });
    expect(placementFor("LILB", "Base 3-4 D", 1)).toEqual({ slot: "LB1" });
    expect(placementFor("RILB", "Base 3-4 D", 1)).toEqual({ slot: "LB2" });
    expect(placementFor("NT", "Base 3-4 D", 1)).toEqual({ pick: ["IDL_L", "IDL_R"] });
  });

  it("ranks receivers and maps the rest directly", () => {
    expect(placementFor("WR", "3WR 1TE", 1)).toEqual({ slot: "WR1" });
    expect(placementFor("WR", "3WR 1TE", 2)).toEqual({ slot: "WR2" });
    expect(placementFor("WR", "3WR 1TE", 5)).toEqual({ slot: "WR3" });
    expect(placementFor("PK", "Special Teams", 1)).toEqual({ slot: "K" });
    expect(placementFor("FB", "3WR 1TE", 1)).toEqual({ slot: "RB" });
    expect(placementFor("H", "Special Teams", 1)).toBeNull();
    for (const abb of [
      "LT",
      "LG",
      "C",
      "RG",
      "RT",
      "QB",
      "RB",
      "TE",
      "NB",
      "P",
      "LS",
      "KR",
      "PR",
    ]) {
      expect(placementFor(abb, "x", 1)).toEqual({ slot: abb });
    }
  });

  it("falls back from generic snap positions", () => {
    expect(fallbackPlacement("T")).toEqual({ pick: ["LT", "RT"] });
    expect(fallbackPlacement("OL")).toEqual({ pick: ["LT", "LG", "C", "RG", "RT"] });
    expect(fallbackPlacement("DB")).toEqual({ pick: ["CB_L", "CB_R"] });
    expect(fallbackPlacement("HB")).toEqual({ slot: "RB" });
    expect(fallbackPlacement("XX")).toBeNull();
  });
});

describe("pool classification", () => {
  it("uses the depth chart first, then NGS, players.csv and snap positions", () => {
    expect(poolForDepthChart("RDE", "Base 3-4 D")).toBe("IDL");
    expect(poolForDepthChart("SLB", "Base 3-4 D")).toBe("EDGE");
    expect(poolForDepthChart("SLB", "Base 4-3 D")).toBe("LB");
    expect(poolForDepthChart("H", "Special Teams")).toBeNull();
    expect(poolForNgsPosition("SLOT_CB")).toBe("CB");
    expect(poolForNgsPosition("HIGH_SAFETY")).toBe("S");
    expect(poolForNgsPosition(null)).toBeNull();
    expect(poolForPosition("OLB")).toBe("EDGE");
    expect(poolForPosition("LS")).toBe("P");
    expect(poolForPosition("XX")).toBeNull();
    expect(classifyPool({ depthChart: { posAbb: "LCB", posGrp: "Base 4-3 D" } })).toBe("CB");
    expect(classifyPool({ snapPosition: "DL" })).toBe("IDL");
    expect(classifyPool({ statsPosition: "SAF" })).toBe("S");
    expect(classifyPool({})).toBeNull();
  });

  it("lets a safety keep his pool when the chart still lists him at nickel", () => {
    const nb = { posAbb: "NB", posGrp: "Base 4-3 D" };
    const safety = {
      gsisId: "s",
      name: "S",
      jersey: 5,
      position: "SAF",
      positionGroup: "DB",
      ngsPosition: "SAFETY",
      latestTeam: "DET",
    };
    expect(classifyPool({ depthChart: nb, info: safety, statsPosition: "SAF" })).toBe("S");
    expect(classifyPool({ depthChart: nb, info: safety })).toBe("S");
    // Any disagreement keeps the chart's word.
    expect(classifyPool({ depthChart: nb, info: safety, statsPosition: "CB" })).toBe("CB");
    expect(classifyPool({ depthChart: nb, info: { ...safety, ngsPosition: "SLOT_CB" } })).toBe(
      "CB",
    );
    expect(
      classifyPool({ depthChart: { ...nb, posAbb: "LCB" }, info: safety, statsPosition: "SAF" }),
    ).toBe("CB");
  });
});

describe("assignSlots", () => {
  const team = "DET";
  const chart = [
    chartRow(team, "qb1", "QB", "3WR 1TE"),
    chartRow(team, "wr1", "WR", "3WR 1TE", 1),
    chartRow(team, "wr2", "WR", "3WR 1TE", 2),
    chartRow(team, "wr4", "WR", "3WR 1TE", 4),
    chartRow(team, "lt1", "LT", "3WR 1TE"),
    chartRow(team, "olb1", "WLB", "Base 3-4 D"),
    chartRow(team, "olb2", "SLB", "Base 3-4 D"),
    chartRow(team, "ilb1", "LILB", "Base 3-4 D"),
    chartRow(team, "de1", "LDE", "Base 3-4 D"),
    chartRow(team, "ret", "PR", "Special Teams"),
    chartRow(team, "ret", "KR", "Special Teams"),
    chartRow(team, "ret", "WR", "3WR 1TE", 5),
    chartRow(team, "p", "P", "Special Teams"),
    chartRow(team, "p", "H", "Special Teams"),
    // A stale snapshot after kickoff must be ignored.
    chartRow(team, "ghost", "QB", "3WR 1TE", 1, "2026-09-28T06:00:00Z"),
  ];

  it("places listed players, stacks by snaps, and falls back for unlisted ones", () => {
    const people = [
      person("qb1", "QB", 65),
      person("wr1", "WR", 60),
      person("wr2", "WR", 50),
      person("wr4", "WR", 20),
      person("lt1", "T", 65),
      person("rt-unlisted", "T", 65),
      person("g-unlisted", "G", 40),
      person("olb1", "LB", 0, 60),
      person("olb2", "LB", 0, 55),
      person("ilb1", "LB", 0, 66),
      person("de1", "DE", 0, 50),
      person("lb-unlisted", "LB", 0, 30),
      person("cb-unlisted", "CB", 0, 66),
      person("ret", "WR", 0, 0, 12),
      person("p", "P", 0, 0, 7),
      person("ghost", "QB", 0, 0, 0),
      person("nobody", "XX", 5),
    ];
    const out = assignSlots(chart, team, KICKOFF, people);
    const at = (slot: string) => out.filter((a) => a.slot === slot).map((a) => a.gsisId);
    expect(at("QB")).toEqual(["qb1"]);
    expect(at("WR1")).toEqual(["wr1"]);
    expect(at("WR2")).toEqual(["wr2"]);
    expect(at("WR3")).toEqual(["wr4"]);
    expect(at("LT")).toEqual(["lt1"]);
    expect(at("RT")).toEqual(["rt-unlisted"]);
    expect(at("LG")).toEqual(["g-unlisted"]);
    expect(at("EDGE_L")).toEqual(["olb1"]);
    expect(at("EDGE_R")).toEqual(["olb2"]);
    expect(at("LB1")).toEqual(["ilb1"]);
    expect(at("LB2")).toEqual(["lb-unlisted"]);
    expect(at("IDL_L")).toEqual(["de1"]);
    expect(at("CB_L")).toEqual(["cb-unlisted"]);
    expect(at("KR")).toEqual(["ret"]);
    expect(at("PR")).toEqual(["ret"]);
    expect(at("P")).toEqual(["p"]);
    expect(out.some((a) => a.gsisId === "ghost" || a.gsisId === "nobody")).toBe(false);
    expect(out.every((a) => a.snaps > 0)).toBe(true);
    const order = out.map((a) => slotOrder(a.slot));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("tiles the players who actually returned kicks and keeps the chart only when nobody did", () => {
    const people = [
      person("ret", "WR", 0, 0, 12),
      person("rb2", "RB", 8, 0, 10),
      person("wr9", "WR", 30, 0, 9),
    ];
    const returners = { KR: new Map([["rb2", 2]]), PR: new Map<string, number>() };
    const out = assignSlots(chart, team, KICKOFF, people, returners);
    const at = (slot: string) => out.filter((a) => a.slot === slot).map((a) => a.gsisId);
    expect(at("KR")).toEqual(["rb2"]);
    expect(out.find((a) => a.slot === "KR")).toMatchObject({ unit: "st", snaps: 10 });
    // No punt was returned, so the chart's PR listing still names the tile.
    expect(at("PR")).toEqual(["ret"]);
    // A returner who is not among the participants (no snap row) is skipped; two live returners
    // stack by snaps.
    const both = assignSlots(chart, team, KICKOFF, people, {
      KR: new Map([
        ["ghost-ret", 1],
        ["wr9", 1],
        ["rb2", 2],
      ]),
      PR: new Map([["wr9", 1]]),
    });
    expect(both.filter((a) => a.slot === "KR").map((a) => a.gsisId)).toEqual(["rb2", "wr9"]);
    expect(both.filter((a) => a.slot === "PR").map((a) => a.gsisId)).toEqual(["wr9"]);
    expect(assignSlots(chart, team, KICKOFF, people)).toEqual(
      assignSlots(chart, team, KICKOFF, people, { KR: new Map(), PR: new Map() }),
    );
  });

  it("orders stacked players by snaps within a slot", () => {
    const people = [person("wr4", "WR", 20), person("wr5", "WR", 45)];
    const stacked = [...chart, chartRow(team, "wr5", "WR", "3WR 1TE", 6)];
    const out = assignSlots(stacked, team, KICKOFF, people).filter((a) => a.slot === "WR3");
    expect(out.map((a) => a.gsisId)).toEqual(["wr5", "wr4"]);
  });

  it("returns nothing without a chart or snaps", () => {
    expect(assignSlots([], team, KICKOFF, [])).toEqual([]);
    expect(depthChartSnapshot(chart, "NYJ", KICKOFF)).toEqual([]);
  });
});

describe("rebalanceSecondary", () => {
  const team = "DET";
  const at = (out: readonly { slot: string; gsisId: string }[], slot: string) =>
    out.filter((a) => a.slot === slot).map((a) => a.gsisId);
  const secondary = [
    chartRow(team, "lcb", "LCB", "Base 4-3 D"),
    chartRow(team, "rcb", "RCB", "Base 4-3 D"),
    chartRow(team, "ss", "SS", "Base 4-3 D"),
    chartRow(team, "fs", "FS", "Base 4-3 D"),
    chartRow(team, "nb1", "NB", "Base 4-3 D", 1),
    chartRow(team, "nb2", "NB", "Base 4-3 D", 2),
    chartRow(team, "nb3", "NB", "Base 4-3 D", 3),
  ];

  it("fills an empty safety tile from a stacked nickel listing by snap position", () => {
    // The listed SS sat out; the DB listed NB1 took his snaps while NB2 was the actual nickel.
    const people = [
      person("lcb", "CB", 0, 62),
      person("rcb", "CB", 0, 13),
      person("fs", "S", 0, 66),
      person("nb1", "DB", 0, 64),
      person("nb2", "CB", 0, 64),
      person("nb3", "CB", 0, 23),
    ];
    const out = assignSlots(secondary, team, KICKOFF, people);
    expect(at(out, "S1")).toEqual(["nb1"]);
    expect(at(out, "S2")).toEqual(["fs"]);
    expect(at(out, "NB")).toEqual(["nb2", "nb3"]);
    expect(out.find((a) => a.slot === "S1")).toMatchObject({ unit: "defense", snaps: 64 });
  });

  it("fills an empty corner tile from a stacked nickel listing, deepest listing first", () => {
    const people = [
      person("lcb", "CB", 0, 62),
      person("fs", "S", 0, 66),
      person("ss", "S", 0, 60),
      person("nb1", "CB", 0, 64),
      person("nb2", "CB", 0, 64),
    ];
    const out = assignSlots(secondary, team, KICKOFF, people);
    expect(at(out, "CB_R")).toEqual(["nb2"]);
    expect(at(out, "NB")).toEqual(["nb1"]);
  });

  it("borrows the spare from a stacked pair before touching the nickel", () => {
    const stackedPair = [...secondary, chartRow(team, "fs2", "FS", "Base 4-3 D", 2)];
    const people = [
      person("lcb", "CB", 0, 62),
      person("rcb", "CB", 0, 60),
      person("fs", "S", 0, 66),
      person("fs2", "S", 0, 40),
      person("nb1", "DB", 0, 64),
      person("nb2", "CB", 0, 64),
    ];
    const out = assignSlots(stackedPair, team, KICKOFF, people);
    expect(at(out, "S1")).toEqual(["fs2"]);
    expect(at(out, "S2")).toEqual(["fs"]);
    expect(at(out, "NB")).toEqual(["nb1", "nb2"]);
  });

  it("never promotes a dime back or a corner into a safety tile", () => {
    const people = [
      person("lcb", "CB", 0, 62),
      person("rcb", "CB", 0, 60),
      person("fs", "S", 0, 66),
      person("nb1", "CB", 0, 64),
      person("nb2", "DB", 0, 10),
    ];
    const out = assignSlots(secondary, team, KICKOFF, people);
    expect(at(out, "S1")).toEqual([]);
    expect(at(out, "NB")).toEqual(["nb1", "nb2"]);
  });
});

describe("gameReturners", () => {
  it("counts live returns per player from the DET side of the fixture game", async () => {
    const pbp = await readCsv(fixture("play_by_play.csv.gz"), {
      schema: PbpRow,
      keep: forWeek(2026, 3),
    });
    const det = gameReturners(pbp, "2026_03_NYJ_DET", "DET");
    expect([...det.KR]).toEqual([
      ["00-0038896", 2],
      ["00-0035544", 1],
    ]);
    // Kennedy's other punt return was a fair catch.
    expect([...det.PR]).toEqual([["00-0035544", 1]]);
    const nyj = gameReturners(pbp, "2026_03_NYJ_DET", "NYJ");
    expect(nyj.KR.get("00-0039451")).toBe(4);
    expect(nyj.PR.size).toBe(0);
    expect(gameReturners(pbp, "nope", "DET")).toEqual({ KR: new Map(), PR: new Map() });
  });
});

describe("assignSlots on the real DET and PIT charts", () => {
  it("puts Sewell at LT and Hutchinson at EDGE_L, and treats Watt as an edge in the 3-4", async () => {
    const charts = await readCsv(fixture("depth_charts.csv"), { schema: DepthChartRow });
    const snaps = await readCsv(fixture("snap_counts.csv"), { schema: SnapCountRow });
    const crosswalk = buildCrosswalk(await readCsv(fixture("players.csv"), { schema: PlayersRow }));
    const det = assignSlots(
      charts,
      "DET",
      KICKOFF,
      participants(snaps, "DET", "2026_03_NYJ_DET", crosswalk),
    );
    expect(det.find((a) => a.slot === "LT")?.gsisId).toBe("00-0036880");
    expect(det.find((a) => a.slot === "EDGE_L")?.gsisId).toBe("00-0037236");
    expect(det.find((a) => a.slot === "QB")?.snaps).toBe(65);
    // None of the three listed strong safeties played; Izien (snap position DB, listed NB1)
    // took the safety snaps and moves to S1 while McCreary and Rakestraw stay on the nickel tile.
    expect(det.filter((a) => a.slot === "S1").map((a) => a.gsisId)).toEqual(["00-0038820"]);
    expect(det.filter((a) => a.slot === "NB").map((a) => a.gsisId)).toEqual([
      "00-0038125",
      "00-0039862",
    ]);
    expect(det.find((a) => a.slot === "S2")?.gsisId).toBe("00-0033294");
    const pit = assignSlots(
      charts,
      "PIT",
      KICKOFF,
      participants(snaps, "PIT", "2026_03_CIN_PIT", crosswalk),
    );
    const watt = pit.find((a) => a.gsisId === "00-0033886");
    expect(watt?.slot).toBe("EDGE_L");
    const heyward = pit.find((a) => a.gsisId === "00-0027969");
    expect(heyward?.slot).toBe("IDL_R");
  });
});
