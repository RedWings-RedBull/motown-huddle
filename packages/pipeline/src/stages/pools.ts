import type { Pool } from "@huddle/shared";

import type { PlayerInfo } from "../crosswalk.js";

/**
 * League-wide pool classification. Order of evidence: the team's depth-chart slot (which knows
 * 3-4 vs 4-3), then players.csv ngs_position (EDGE / INTERIOR_LINE / MLB ...), then players.csv
 * position, then the generic snap_counts position. Returns null for positions that are not
 * graded per player (offensive line is a unit; long snappers are listed under P for identity).
 */
export function poolForDepthChart(posAbb: string, posGrp: string): Pool | null {
  const threeFour = posGrp === "Base 3-4 D";
  switch (posAbb) {
    case "QB":
      return "QB";
    case "RB":
    case "FB":
      return "RB";
    case "WR":
      return "WR";
    case "TE":
      return "TE";
    case "LT":
    case "LG":
    case "C":
    case "RG":
    case "RT":
      return "OL";
    case "LDE":
    case "RDE":
      return threeFour ? "IDL" : "EDGE";
    case "LDT":
    case "RDT":
    case "NT":
      return "IDL";
    case "WLB":
    case "SLB":
      return threeFour ? "EDGE" : "LB";
    case "MLB":
    case "LILB":
    case "RILB":
      return "LB";
    case "LCB":
    case "RCB":
    case "NB":
      return "CB";
    case "SS":
    case "FS":
      return "S";
    case "PK":
      return "K";
    case "P":
      return "P";
    case "KR":
    case "PR":
      return "RET";
    default:
      return null;
  }
}

export function poolForNgsPosition(ngs: string | null): Pool | null {
  switch (ngs) {
    case "QB":
      return "QB";
    case "RB":
      return "RB";
    case "WR":
    case "SLOT_WR":
      return "WR";
    case "TE":
      return "TE";
    case "T":
    case "G":
    case "C":
      return "OL";
    case "EDGE":
      return "EDGE";
    case "INTERIOR_LINE":
      return "IDL";
    case "MLB":
      return "LB";
    case "CB":
    case "SLOT_CB":
      return "CB";
    case "SAFETY":
    case "HIGH_SAFETY":
      return "S";
    default:
      return null;
  }
}

/** Generic positions as they appear in players.csv, stats_player and snap_counts. */
export function poolForPosition(position: string | null): Pool | null {
  switch (position) {
    case "QB":
      return "QB";
    case "RB":
    case "HB":
    case "FB":
      return "RB";
    case "WR":
      return "WR";
    case "TE":
      return "TE";
    case "T":
    case "OT":
    case "G":
    case "OG":
    case "C":
    case "OL":
      return "OL";
    case "DE":
    case "OLB":
      return "EDGE";
    case "DT":
    case "NT":
    case "DL":
      return "IDL";
    case "LB":
    case "ILB":
    case "MLB":
      return "LB";
    case "CB":
    case "DB":
      return "CB";
    case "S":
    case "SS":
    case "FS":
    case "SAF":
      return "S";
    case "K":
    case "PK":
      return "K";
    case "P":
      return "P";
    case "LS":
      return "P";
    default:
      return null;
  }
}

export interface PoolEvidence {
  depthChart?: { posAbb: string; posGrp: string } | undefined;
  info?: PlayerInfo | undefined;
  snapPosition?: string | undefined;
  statsPosition?: string | null | undefined;
}

/**
 * Depth charts go stale: a safety who keeps his old nickel listing would otherwise be graded
 * against corners with corner components. When players.csv (ngs_position) and the weekly stats
 * position both call him a safety, the listing loses.
 */
function safetyListedAsNickel(e: PoolEvidence): boolean {
  if (e.depthChart?.posAbb !== "NB") return false;
  const elsewhere =
    poolForPosition(e.statsPosition ?? null) ?? poolForPosition(e.info?.position ?? null);
  return poolForNgsPosition(e.info?.ngsPosition ?? null) === "S" && elsewhere === "S";
}

export function classifyPool(e: PoolEvidence): Pool | null {
  if (e.depthChart) {
    const p = poolForDepthChart(e.depthChart.posAbb, e.depthChart.posGrp);
    if (p) return safetyListedAsNickel(e) ? "S" : p;
  }
  const fromNgs = poolForNgsPosition(e.info?.ngsPosition ?? null);
  if (fromNgs) return fromNgs;
  const fromPlayers = poolForPosition(e.info?.position ?? null);
  if (fromPlayers) return fromPlayers;
  const fromStats = poolForPosition(e.statsPosition ?? null);
  if (fromStats) return fromStats;
  return poolForPosition(e.snapPosition ?? null);
}

/** The engine owns the pool -> unit map so tiles and extraction can never disagree. */
export { unitForPool } from "@huddle/grades";
