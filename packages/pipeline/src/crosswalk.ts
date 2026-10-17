import type { PlayersRow } from "./columns.js";
import { ValidationError } from "./errors.js";

/** Player identity from players.csv, keyed by gsis_id, with the pfr_id -> gsis_id crosswalk. */
export interface PlayerInfo {
  gsisId: string;
  name: string;
  jersey: number | null;
  position: string | null;
  ngsPosition: string | null;
}

export interface Crosswalk {
  byGsis: Map<string, PlayerInfo>;
  byPfr: Map<string, PlayerInfo>;
  gsisForPfr(pfrId: string): string | null;
}

export function buildCrosswalk(rows: readonly PlayersRow[]): Crosswalk {
  const byGsis = new Map<string, PlayerInfo>();
  const byPfr = new Map<string, PlayerInfo>();
  for (const row of rows) {
    if (row.gsis_id === null) continue;
    const info: PlayerInfo = {
      gsisId: row.gsis_id,
      name: row.display_name,
      jersey: row.jersey_number === null ? null : Math.trunc(row.jersey_number),
      position: row.position,
      ngsPosition: row.ngs_position,
    };
    byGsis.set(row.gsis_id, info);
    if (row.pfr_id !== null && !byPfr.has(row.pfr_id)) byPfr.set(row.pfr_id, info);
  }
  return {
    byGsis,
    byPfr,
    gsisForPfr: (pfrId) => byPfr.get(pfrId)?.gsisId ?? null,
  };
}

export interface CrosswalkCheck {
  unmatched: string[];
  /** Unmatched rows as a fraction of the rows checked. */
  share: number;
}

/**
 * Checks how many of the configured team's PFR-keyed rows (snap counts, advanced stats) map to a
 * gsis_id. More than `maxShare` (2 %) unmatched means the crosswalk is stale and the grades would
 * silently drop starters, so the pipeline exits 2 instead of publishing.
 */
export function checkCrosswalk(
  crosswalk: Crosswalk,
  rows: readonly { pfr_player_id: string; player?: string; pfr_player_name?: string }[],
  maxShare = 0.02,
): CrosswalkCheck {
  const unmatched = rows
    .filter((r) => crosswalk.gsisForPfr(r.pfr_player_id) === null)
    .map((r) => `${r.player ?? r.pfr_player_name ?? "?"} (${r.pfr_player_id})`);
  const share = rows.length === 0 ? 0 : unmatched.length / rows.length;
  if (share > maxShare) {
    throw new ValidationError(
      `crosswalk: ${unmatched.length} of ${rows.length} team rows have no gsis_id: ${unmatched.join(", ")}`,
    );
  }
  return { unmatched, share };
}
