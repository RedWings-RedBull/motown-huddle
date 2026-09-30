import type { Tier } from "@huddle/shared";

import { NotReadyError } from "../errors.js";

export interface ReadinessCounts {
  pbpRows: number;
  snapRows: number;
  /** Only checked for the Final tier. */
  pfrDefRows?: number;
  pfrPassRows?: number;
}

const FINAL_MIN_DEF_ROWS = 20;
const FINAL_MIN_PASS_ROWS = 2;

/**
 * Provisional needs play-by-play and snap counts for the game. Final additionally needs enough
 * PFR advanced-stat rows for the game_id (a partial PFR drop must never publish a false Final).
 * Throws NotReadyError (exit 3) with the reason.
 */
export function assertReady(tier: Tier, gameId: string, counts: ReadinessCounts): void {
  const missing: string[] = [];
  if (counts.pbpRows === 0) missing.push("pbp has no plays for the game");
  if (counts.snapRows === 0) missing.push("snap_counts has no rows for the game");
  if (tier === "final") {
    const def = counts.pfrDefRows ?? 0;
    const pass = counts.pfrPassRows ?? 0;
    if (def < FINAL_MIN_DEF_ROWS) {
      missing.push(`advstats_week_def has ${def} rows (< ${FINAL_MIN_DEF_ROWS})`);
    }
    if (pass < FINAL_MIN_PASS_ROWS) {
      missing.push(`advstats_week_pass has ${pass} rows (< ${FINAL_MIN_PASS_ROWS})`);
    }
  }
  if (missing.length > 0) {
    throw new NotReadyError(`${gameId} not ready for ${tier}: ${missing.join("; ")}`);
  }
}
