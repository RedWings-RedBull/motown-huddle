import type { KeyPlay, KeyPlays } from "@huddle/shared";

import type { PbpRow } from "../columns.js";
import { is1, isExplosive } from "./context.js";

const KEY_PLAYS_TOP_WPA = 8;
const KEY_PLAYS_CAP = 12;

export function tagsFor(p: PbpRow): KeyPlay["tags"] {
  const tags: KeyPlay["tags"] = [];
  if (is1(p.touchdown)) tags.push("td");
  if (is1(p.interception) || is1(p.fumble_lost)) tags.push("turnover");
  if (p.down === 4) tags.push("fourth-down");
  if (is1(p.sack)) tags.push("sack");
  if (isExplosive(p)) tags.push("explosive");
  if (is1(p.field_goal_attempt)) tags.push("fg");
  if (is1(p.penalty)) tags.push("penalty");
  return tags;
}

function isScoring(p: PbpRow): boolean {
  return is1(p.touchdown) || p.field_goal_result === "made" || is1(p.safety);
}

/** The configured team's go-for-it decisions (pass or run on fourth down). */
function isTeamFourthDownGo(p: PbpRow, team: string): boolean {
  return p.posteam === team && p.down === 4 && (p.play_type === "pass" || p.play_type === "run");
}

function toKeyPlay(p: PbpRow): KeyPlay {
  return {
    playId: p.play_id,
    qtr: Math.max(1, Math.min(6, Math.trunc(p.qtr ?? 1))),
    clock: p.time ?? "",
    down: p.down === null ? null : Math.trunc(p.down),
    ydstogo: p.ydstogo === null ? null : Math.trunc(p.ydstogo),
    yardline100:
      p.yardline_100 === null || p.yardline_100 < 1 || p.yardline_100 > 100
        ? null
        : Math.trunc(p.yardline_100),
    posteam: p.posteam ?? "",
    desc: p.desc ?? "",
    epa: p.epa ?? 0,
    wpa: p.wpa ?? 0,
    tags: tagsFor(p),
  };
}

/**
 * The top plays by |wpa|, then scoring plays and the team's fourth-down decisions (together, by
 * |wpa|) until the cap of 12, returned in game order.
 */
export function keyPlays(
  pbp: readonly PbpRow[],
  args: { season: number; week: number; gameId: string; team: string },
): KeyPlays {
  const game = pbp.filter((p) => p.game_id === args.gameId && p.wpa !== null && p.posteam !== null);
  const byWpa = [...game].sort((a, b) => Math.abs(b.wpa ?? 0) - Math.abs(a.wpa ?? 0));
  const chosen = new Map<number, PbpRow>();
  const take = (rows: PbpRow[]) => {
    for (const p of rows) {
      if (chosen.size >= KEY_PLAYS_CAP) return;
      chosen.set(p.play_id, p);
    }
  };
  take(byWpa.slice(0, KEY_PLAYS_TOP_WPA));
  take(byWpa.filter((p) => isScoring(p) || isTeamFourthDownGo(p, args.team)));
  const plays = [...chosen.values()].sort((a, b) => a.play_id - b.play_id).map(toKeyPlay);
  return { season: args.season, week: args.week, gameId: args.gameId, plays };
}
