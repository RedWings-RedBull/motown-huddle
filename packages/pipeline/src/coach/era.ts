import type { EraSeason } from "@huddle/shared";
import { divisionOf } from "@huddle/shared";

import type { GamesRow } from "../columns.js";
import { isFinal } from "../stages/resolveGame.js";

interface Tally {
  w: number;
  l: number;
  t: number;
}

const tally = (): Tally => ({ w: 0, l: 0, t: 0 });
const add = (t: Tally, mine: number, theirs: number): void => {
  if (mine > theirs) t.w += 1;
  else if (mine < theirs) t.l += 1;
  else t.t += 1;
};

/**
 * The team's head coach in its most recent completed game, per the schedule file. Ordered by game
 * date rather than kickoff time because historical rows (1999 onward) have no kickoff time.
 */
export function currentCoach(games: readonly GamesRow[], team: string, now: Date): string | null {
  const today = now.toISOString().slice(0, 10);
  const rows = games
    .filter(
      (g) => (g.home_team === team || g.away_team === team) && isFinal(g) && g.gameday <= today,
    )
    .sort((a, b) => b.gameday.localeCompare(a.gameday) || b.week - a.week);
  const latest = rows[0];
  if (!latest) return null;
  return latest.home_team === team ? latest.home_coach : latest.away_coach;
}

/** Per-season splits for every game the coach led for the team. */
export function eraRecord(games: readonly GamesRow[], team: string, coach: string): EraSeason[] {
  const seasons = new Map<number, EraSeason>();
  const get = (season: number): EraSeason => {
    let s = seasons.get(season);
    if (!s) {
      s = {
        season,
        regular: tally(),
        postseason: tally(),
        home: tally(),
        away: tally(),
        oneScore: tally(),
        favorite: tally(),
        underdog: tally(),
        division: tally(),
      };
      seasons.set(season, s);
    }
    return s;
  };
  for (const g of games) {
    const home = g.home_team === team;
    if (!home && g.away_team !== team) continue;
    const myCoach = home ? g.home_coach : g.away_coach;
    if (myCoach !== coach || !isFinal(g)) continue;
    const mine = (home ? g.home_score : g.away_score) ?? 0;
    const theirs = (home ? g.away_score : g.home_score) ?? 0;
    const s = get(g.season);
    add(g.game_type === "REG" ? s.regular : s.postseason, mine, theirs);
    add(home ? s.home : s.away, mine, theirs);
    if (Math.abs(mine - theirs) <= 8) add(s.oneScore, mine, theirs);
    if (g.spread_line !== null && g.spread_line !== 0) {
      const favored = home ? g.spread_line > 0 : g.spread_line < 0;
      add(favored ? s.favorite : s.underdog, mine, theirs);
    }
    const opponent = home ? g.away_team : g.home_team;
    if (divisionOf(opponent) === divisionOf(team)) add(s.division, mine, theirs);
  }
  return [...seasons.values()].sort((a, b) => a.season - b.season);
}
