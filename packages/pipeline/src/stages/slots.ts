import type { Slot, SlotAssignment, Unit } from "@huddle/shared";

import type { DepthChartRow, PbpRow, SnapCountRow } from "../columns.js";
import type { Crosswalk } from "../crosswalk.js";
import { depthChartSnapshot, is1 } from "./context.js";

const SLOT_UNIT: Record<Slot, Unit> = {
  QB: "offense",
  RB: "offense",
  WR1: "offense",
  WR2: "offense",
  WR3: "offense",
  TE: "offense",
  LT: "offense",
  LG: "offense",
  C: "offense",
  RG: "offense",
  RT: "offense",
  EDGE_L: "defense",
  IDL_L: "defense",
  IDL_R: "defense",
  EDGE_R: "defense",
  LB1: "defense",
  LB2: "defense",
  CB_L: "defense",
  CB_R: "defense",
  NB: "defense",
  S1: "defense",
  S2: "defense",
  K: "st",
  P: "st",
  LS: "st",
  KR: "st",
  PR: "st",
};

/** A depth-chart listing resolved to a field slot, or a request to place by snaps among options. */
type Placement = { slot: Slot } | { pick: Slot[] };

/**
 * Table-driven pos_abb -> slot mapping. `pos_grp` distinguishes a 3-4 front, where the outside
 * linebackers are the edge rushers and the listed ends play inside. Returns null for listings
 * that have no tile (holder, fullback, extra receivers beyond three stack on WR3).
 */
export function placementFor(posAbb: string, posGrp: string, posRank: number): Placement | null {
  const threeFour = posGrp === "Base 3-4 D";
  switch (posAbb) {
    case "QB":
    case "RB":
    case "TE":
    case "LT":
    case "LG":
    case "C":
    case "RG":
    case "RT":
    case "NB":
    case "P":
    case "LS":
    case "KR":
    case "PR":
      return { slot: posAbb };
    case "FB":
      return { slot: "RB" };
    case "WR":
      return { slot: posRank <= 1 ? "WR1" : posRank === 2 ? "WR2" : "WR3" };
    case "LDE":
      return { slot: threeFour ? "IDL_L" : "EDGE_L" };
    case "RDE":
      return { slot: threeFour ? "IDL_R" : "EDGE_R" };
    case "LDT":
      return { slot: "IDL_L" };
    case "RDT":
      return { slot: "IDL_R" };
    case "NT":
      return { pick: ["IDL_L", "IDL_R"] };
    case "WLB":
      return threeFour ? { slot: "EDGE_L" } : { pick: ["LB1", "LB2"] };
    case "SLB":
      return threeFour ? { slot: "EDGE_R" } : { pick: ["LB1", "LB2"] };
    case "MLB":
      return { pick: ["LB1", "LB2"] };
    case "LILB":
      return { slot: "LB1" };
    case "RILB":
      return { slot: "LB2" };
    case "LCB":
      return { slot: "CB_L" };
    case "RCB":
      return { slot: "CB_R" };
    case "SS":
      return { slot: "S1" };
    case "FS":
      return { slot: "S2" };
    case "PK":
      return { slot: "K" };
    default:
      return null;
  }
}

/** Chart-miss fallback from the generic snap_counts position. */
export function fallbackPlacement(position: string): Placement | null {
  switch (position) {
    case "QB":
      return { slot: "QB" };
    case "RB":
    case "HB":
    case "FB":
      return { slot: "RB" };
    case "WR":
      return { slot: "WR3" };
    case "TE":
      return { slot: "TE" };
    case "T":
      return { pick: ["LT", "RT"] };
    case "G":
      return { pick: ["LG", "RG"] };
    case "C":
      return { slot: "C" };
    case "OL":
      return { pick: ["LT", "LG", "C", "RG", "RT"] };
    case "DE":
      return { pick: ["EDGE_L", "EDGE_R"] };
    case "DT":
    case "DL":
    case "NT":
      return { pick: ["IDL_L", "IDL_R"] };
    case "LB":
      return { pick: ["LB1", "LB2"] };
    case "CB":
    case "DB":
      return { pick: ["CB_L", "CB_R"] };
    case "S":
      return { pick: ["S1", "S2"] };
    case "K":
      return { slot: "K" };
    case "P":
      return { slot: "P" };
    case "LS":
      return { slot: "LS" };
    default:
      return null;
  }
}

export interface Participant {
  gsisId: string;
  position: string;
  offense: { snaps: number; pct: number };
  defense: { snaps: number; pct: number };
  st: { snaps: number; pct: number };
}

/** Players with any snaps for the team in the game, keyed to gsis_id through the crosswalk. */
export function participants(
  snaps: readonly SnapCountRow[],
  team: string,
  gameId: string,
  crosswalk: Crosswalk,
): Participant[] {
  const out: Participant[] = [];
  for (const s of snaps) {
    if (s.team !== team || s.game_id !== gameId) continue;
    const gsisId = crosswalk.gsisForPfr(s.pfr_player_id);
    if (gsisId === null) continue;
    const p: Participant = {
      gsisId,
      position: s.position,
      offense: { snaps: Math.trunc(s.offense_snaps ?? 0), pct: clamp01(s.offense_pct) },
      defense: { snaps: Math.trunc(s.defense_snaps ?? 0), pct: clamp01(s.defense_pct) },
      st: { snaps: Math.trunc(s.st_snaps ?? 0), pct: clamp01(s.st_pct) },
    };
    if (p.offense.snaps + p.defense.snaps + p.st.snaps > 0) out.push(p);
  }
  return out;
}

function clamp01(v: number | null): number {
  return Math.min(1, Math.max(0, v ?? 0));
}

/** Who actually returned kicks in the game (returns per gsis_id), by tile. */
export interface Returners {
  KR: ReadonlyMap<string, number>;
  PR: ReadonlyMap<string, number>;
}

/**
 * Live returns from play-by-play, excluding touchbacks and fair catches. Kickoffs list the
 * receiving team as posteam; punts list the punting team, so the punt returner is on defteam.
 */
export function gameReturners(pbp: readonly PbpRow[], gameId: string, team: string): Returners {
  const kr = new Map<string, number>();
  const pr = new Map<string, number>();
  const bump = (map: Map<string, number>, id: string) => {
    map.set(id, (map.get(id) ?? 0) + 1);
  };
  for (const p of pbp) {
    if (p.game_id !== gameId || is1(p.touchback)) continue;
    if (
      is1(p.kickoff_attempt) &&
      p.posteam === team &&
      p.kickoff_returner_player_id !== null &&
      !is1(p.kickoff_fair_catch)
    ) {
      bump(kr, p.kickoff_returner_player_id);
    } else if (
      is1(p.punt_attempt) &&
      p.defteam === team &&
      p.punt_returner_player_id !== null &&
      !is1(p.punt_fair_catch)
    ) {
      bump(pr, p.punt_returner_player_id);
    }
  }
  return { KR: kr, PR: pr };
}

interface Pending {
  participant: Participant;
  placement: Placement;
  /** Lower comes first when several players compete for LB1/LB2-style picks. */
  chartRank: number;
}

/**
 * Places every participant on the 27 field slots: depth-chart listing first (latest snapshot at
 * or before kickoff), snap_counts position as fallback. A player fills at most one slot per unit,
 * except that one returner may hold both KR and PR. Players stack per slot ordered by snap share.
 * An empty safety or corner tile borrows from its stacked pair or from a stacked nickel listing
 * (see `rebalanceSecondary`). When `returners` is given, KR and PR show the players who actually
 * fielded a kick in the game; the chart's KR/PR listings are used only when nobody returned one.
 */
export function assignSlots(
  depthCharts: readonly DepthChartRow[],
  team: string,
  kickoffUtc: string,
  people: readonly Participant[],
  returners?: Returners,
): SlotAssignment[] {
  const chart = depthChartSnapshot(depthCharts, team, kickoffUtc);
  const byId = new Map(people.map((p) => [p.gsisId, p] as const));
  const live = (slot: "KR" | "PR") => returners !== undefined && returners[slot].size > 0;
  const pending: Pending[] = [];
  for (const p of people) {
    const listings = chart
      .filter((r) => r.gsis_id === p.gsisId)
      .sort((a, b) => a.pos_rank - b.pos_rank);
    const seenUnits = new Set<Unit>();
    for (const row of listings) {
      const placement = placementFor(row.pos_abb, row.pos_grp, row.pos_rank);
      if (!placement) continue;
      const unit = unitOf(placement);
      const returner = row.pos_abb === "KR" || row.pos_abb === "PR";
      if ((row.pos_abb === "KR" || row.pos_abb === "PR") && live(row.pos_abb)) continue;
      if (seenUnits.has(unit) && !returner) continue;
      if (unitSnaps(p, unit).snaps === 0) continue;
      seenUnits.add(unit);
      pending.push({ participant: p, placement, chartRank: row.pos_rank });
    }
    if (seenUnits.size === 0) {
      const placement = fallbackPlacement(p.position);
      if (placement) pending.push({ participant: p, placement, chartRank: 99 });
    }
  }

  // Direct placements first so picks can balance against real starters.
  const slotSnaps = new Map<Slot, number>();
  const chartRanks = new Map<string, number>();
  const assignments: SlotAssignment[] = [];
  const add = (slot: Slot, p: Participant, chartRank: number) => {
    const unit = SLOT_UNIT[slot];
    const s = unitSnaps(p, unit);
    if (s.snaps === 0) return;
    assignments.push({ slot, unit, gsisId: p.gsisId, snaps: s.snaps, snapPct: s.pct });
    slotSnaps.set(slot, (slotSnaps.get(slot) ?? 0) + s.snaps);
    chartRanks.set(`${slot}:${p.gsisId}`, chartRank);
  };
  for (const item of pending)
    if ("slot" in item.placement) add(item.placement.slot, item.participant, item.chartRank);
  for (const slot of ["KR", "PR"] as const) {
    if (!live(slot) || returners === undefined) continue;
    for (const [gsisId, returns] of returners[slot]) {
      const p = byId.get(gsisId);
      if (p) add(slot, p, 1 - Math.min(returns, 1));
    }
  }
  const picks = pending
    .filter((item): item is Pending & { placement: { pick: Slot[] } } => "pick" in item.placement)
    .sort(
      (x, y) =>
        unitSnaps(y.participant, unitOf(y.placement)).snaps -
          unitSnaps(x.participant, unitOf(x.placement)).snaps || x.chartRank - y.chartRank,
    );
  for (const item of picks) {
    const options = item.placement.pick;
    let best = options[0];
    if (!best) continue;
    for (const option of options) {
      if ((slotSnaps.get(option) ?? 0) < (slotSnaps.get(best) ?? 0)) best = option;
    }
    add(best, item.participant, item.chartRank);
  }
  rebalanceSecondary(assignments, people, chartRanks);
  return assignments.sort(
    (x, y) =>
      slotOrder(x.slot) - slotOrder(y.slot) ||
      y.snaps - x.snaps ||
      x.gsisId.localeCompare(y.gsisId),
  );
}

/** Secondary tiles that borrow from each other when one side is empty and the other stacked. */
const SECONDARY_PAIRS: readonly (readonly [Slot, Slot])[] = [
  ["S1", "S2"],
  ["CB_L", "CB_R"],
];

/** How well a snap_counts position fits a safety or corner tile (higher is better). */
function secondaryFit(slot: Slot, position: string): number {
  const safety = slot === "S1" || slot === "S2";
  if (position === "DB") return 1;
  if (safety) return position === "S" || position === "SS" || position === "FS" ? 2 : 0;
  return position === "CB" ? 2 : 0;
}

/**
 * Fills an empty safety or corner tile from the players who actually took the snaps. Charts go
 * stale: when the listed SS sits out, the DB who replaced him usually stays on his own listing
 * (NB is commonly three deep), leaving S1 empty while NB shows two full-time starters. An empty
 * side borrows first from its pair when that pair is stacked two deep, then from a stacked NB,
 * preferring the snap-count position that fits the tile, then the busier player, then the deeper
 * chart listing. Only players with at least half the busiest defender's snaps move, so a dime
 * back is never promoted to a starting tile.
 */
function rebalanceSecondary(
  assignments: SlotAssignment[],
  people: readonly Participant[],
  chartRanks: ReadonlyMap<string, number>,
): void {
  const position = new Map(people.map((p) => [p.gsisId, p.position] as const));
  const at = (slot: Slot) => assignments.filter((a) => a.slot === slot);
  const busiest = Math.max(
    0,
    ...assignments.filter((a) => a.unit === "defense").map((a) => a.snaps),
  );
  const starter = (a: SlotAssignment) => a.snaps * 2 >= busiest;
  const move = (a: SlotAssignment, slot: Slot) => {
    assignments.splice(assignments.indexOf(a), 1);
    assignments.push({ ...a, slot });
  };
  const rank = (a: SlotAssignment) => chartRanks.get(`${a.slot}:${a.gsisId}`) ?? 99;

  for (const [left, right] of SECONDARY_PAIRS) {
    for (const [empty, donor] of [
      [left, right],
      [right, left],
    ] as const) {
      const stacked = at(donor);
      if (at(empty).length > 0 || stacked.length < 2) continue;
      const spare = stacked.sort(
        (x, y) => x.snaps - y.snaps || x.gsisId.localeCompare(y.gsisId),
      )[0];
      if (spare && starter(spare)) move(spare, empty);
    }
  }
  for (const slot of ["S1", "S2", "CB_L", "CB_R"] as const) {
    if (at(slot).length > 0) continue;
    const nickel = at("NB");
    if (nickel.length < 2) continue;
    const fit = (a: SlotAssignment) => secondaryFit(slot, position.get(a.gsisId) ?? "");
    const [best] = nickel
      .filter((a) => starter(a) && fit(a) > 0)
      .sort(
        (x, y) =>
          fit(y) - fit(x) ||
          y.snaps - x.snaps ||
          rank(y) - rank(x) ||
          x.gsisId.localeCompare(y.gsisId),
      );
    if (best) move(best, slot);
  }
}

function unitOf(placement: Placement): Unit {
  const slot = "slot" in placement ? placement.slot : placement.pick[0];
  return slot ? SLOT_UNIT[slot] : "st";
}

function unitSnaps(p: Participant, unit: Unit): { snaps: number; pct: number } {
  return p[unit];
}

const SLOT_ORDER: readonly Slot[] = Object.keys(SLOT_UNIT) as Slot[];

export function slotOrder(slot: Slot): number {
  return SLOT_ORDER.indexOf(slot);
}
