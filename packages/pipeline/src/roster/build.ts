import type { Pool, PositionGroup, RosterFile, RosterPlayer } from "@huddle/shared";
import { RosterFile as RosterFileSchema } from "@huddle/shared";

import type { InjuryRow, WeeklyRosterRow } from "../columns.js";
import { poolForNgsPosition, poolForPosition } from "../stages/pools.js";

const GROUP_ORDER: readonly PositionGroup[] = [
  "QB",
  "RB",
  "WR",
  "TE",
  "OL",
  "DL",
  "EDGE",
  "LB",
  "CB",
  "S",
  "ST",
];

const POOL_GROUP: Record<Pool, PositionGroup> = {
  QB: "QB",
  RB: "RB",
  WR: "WR",
  TE: "TE",
  OL: "OL",
  EDGE: "EDGE",
  IDL: "DL",
  LB: "LB",
  CB: "CB",
  S: "S",
  K: "ST",
  P: "ST",
  RET: "ST",
};

/** Roster grouping from the same evidence the grading pipeline uses (NGS role first). */
export function positionGroupFor(position: string, ngsPosition: string | null): PositionGroup {
  const pool = poolForNgsPosition(ngsPosition) ?? poolForPosition(position);
  if (pool !== null) return POOL_GROUP[pool];
  if (position === "LS" || position === "K" || position === "P") return "ST";
  return "ST";
}

const toInt = (v: number | null): number | null =>
  v === null || !Number.isFinite(v) ? null : Math.round(v);

/** Specific position and NGS role from players.csv; weekly rosters only carry generic DL/DB. */
export interface PlayerInfo {
  position: string | null;
  ngsPosition: string | null;
}

/**
 * Builds the roster artifact for `team` from the latest regular-season roster week present in
 * `rows`, joined with that week's (or the latest earlier) injury report. Pure and deterministic:
 * players are sorted by group, then jersey, then name.
 */
export function buildRoster(
  rows: readonly WeeklyRosterRow[],
  injuries: readonly InjuryRow[],
  team: string,
  season: number,
  info: ReadonlyMap<string, PlayerInfo> = new Map(),
): RosterFile {
  const mine = rows.filter((r) => r.team === team && r.season === season && r.game_type === "REG");
  const week = Math.max(0, ...mine.map((r) => r.week));
  const latest = new Map<string, WeeklyRosterRow>();
  for (const r of mine) {
    if (r.week !== week || r.gsis_id === null) continue;
    latest.set(r.gsis_id, r);
  }

  const injuryWeeks = injuries
    .filter((i) => i.team === team && i.season === season && i.week <= week)
    .map((i) => i.week);
  const injuryWeek = injuryWeeks.length > 0 ? Math.max(...injuryWeeks) : null;
  const injuryById = new Map<string, InjuryRow>();
  for (const i of injuries) {
    if (i.team !== team || i.season !== season || i.week !== injuryWeek || i.gsis_id === null) {
      continue;
    }
    injuryById.set(i.gsis_id, i);
  }

  const players: RosterPlayer[] = [...latest.values()].map((r) => {
    const gsisId = r.gsis_id ?? "";
    const inj = injuryById.get(gsisId);
    const extra = info.get(gsisId);
    const position = extra?.position ?? r.position;
    const ngs = r.ngs_position ?? extra?.ngsPosition ?? null;
    const draftYear = r.rookie_year === null ? null : toInt(r.rookie_year);
    const draft =
      draftYear !== null && r.draft_club !== null && r.draft_number !== null
        ? { year: draftYear, club: r.draft_club, overall: toInt(r.draft_number) ?? 0 }
        : null;
    return {
      gsisId,
      fullName: r.full_name,
      firstName: r.first_name,
      lastName: r.last_name,
      jersey: toInt(r.jersey_number),
      position,
      positionGroup: positionGroupFor(position, ngs),
      depthChartPosition: r.depth_chart_position,
      status: r.status,
      heightIn: toInt(r.height),
      weightLb: toInt(r.weight),
      birthDate: r.birth_date,
      college: r.college,
      yearsExp: toInt(r.years_exp),
      rookieYear: draftYear,
      draft,
      ids: { pfr: r.pfr_id, espn: r.espn_id },
      injury: inj
        ? {
            reportStatus: inj.report_status,
            primary: inj.report_primary_injury,
            practiceStatus: inj.practice_status,
          }
        : null,
    };
  });

  players.sort((a, b) => {
    const g = GROUP_ORDER.indexOf(a.positionGroup) - GROUP_ORDER.indexOf(b.positionGroup);
    if (g !== 0) return g;
    const j = (a.jersey ?? 999) - (b.jersey ?? 999);
    if (j !== 0) return j;
    return a.fullName.localeCompare(b.fullName);
  });

  return RosterFileSchema.parse({ season, week, team, players });
}
