import type { AggressionSeason, CoachFile, DecisionEntry } from "@huddle/shared";
import { CoachFile as CoachFileSchema, evaluate } from "@huddle/shared";

import type { GamesRow, PbpRow } from "../columns.js";
import { isFinal } from "../stages/resolveGame.js";
import { currentCoach, eraRecord } from "./era.js";
import { aggressionIndex, fourthDownPlays, leagueRows } from "./fourthDown.js";
import { buildTables, secondsInQuarter } from "./tables.js";

export interface CoachInputs {
  games: readonly GamesRow[];
  /** Regular-season plays for every season in `seasons` (all 32 teams). */
  pbp: readonly PbpRow[];
  team: string;
  season: number;
  now: Date;
}

/** Pure: Fourth-Down Aggression Index, decision log, calculator tables and the coach's era record. */
export function buildCoach(inputs: CoachInputs): CoachFile {
  const { games, pbp, team, season, now } = inputs;
  const coach = currentCoach(games, team, now);
  if (coach === null) throw new Error(`No completed ${team} game found to identify the head coach`);

  const plays = fourthDownPlays(pbp);
  const seasons = [...new Set(plays.map((p) => p.season))].sort((a, b) => a - b);
  const index: AggressionSeason[] = [];
  let league: CoachFile["league"] = [];
  for (const s of seasons) {
    const byTeam = aggressionIndex(plays.filter((p) => p.season === s));
    const mine = byTeam.get(team);
    if (mine) index.push(mine);
    if (s === season) league = leagueRows(byTeam);
  }

  const tables = buildTables(pbp);
  const log: DecisionEntry[] = plays
    .filter((p) => p.season === season && p.team === team)
    .map((p) => {
      const calc = evaluate(
        {
          yardline100: p.yardline100,
          ydstogo: p.ydstogo,
          qtr: Math.min(p.qtr, 4),
          secondsInQuarter: secondsInQuarter(p.qtr, p.secondsRemaining),
          scoreDiff: p.scoreDiff,
        },
        tables,
      );
      return {
        gameId: p.gameId,
        week: p.week,
        opponent: p.opponent,
        playId: p.playId,
        qtr: p.qtr,
        clock: p.clock,
        yardline100: p.yardline100,
        ydstogo: p.ydstogo,
        scoreDiff: p.scoreDiff,
        wpPre: p.wp,
        decision: p.decision,
        result: p.result,
        epa: p.epa,
        wpa: p.wpa,
        forced: p.forced,
        calc: {
          goWp: calc.goWp,
          puntWp: calc.puntWp,
          fgWp: calc.fgWp,
          recommended: calc.recommended,
        },
        desc: p.desc,
      };
    })
    .sort((a, b) => a.week - b.week || a.playId - b.playId);

  const era = eraRecord(games, team, coach);
  const throughWeek = Math.max(
    0,
    ...games
      .filter((g) => g.season === season && g.game_type === "REG" && isFinal(g))
      .map((g) => g.week),
  );
  return CoachFileSchema.parse({
    season,
    team,
    coach,
    throughWeek,
    firstSeason: era[0]?.season ?? season,
    index,
    league,
    log,
    era,
    tables,
    tableSeasons: seasons,
  });
}
