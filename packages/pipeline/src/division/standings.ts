import { conferenceOf, divisionOf } from "@huddle/shared";

/** A game with a known result. Scores are final. */
export interface PlayedGame {
  week: number;
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
}

export interface Tally {
  w: number;
  l: number;
  t: number;
}

interface GameLine {
  week: number;
  opponent: string;
  result: "W" | "L" | "T";
  pointsFor: number;
  pointsAgainst: number;
}

export interface TeamRecord extends Tally {
  team: string;
  pointsFor: number;
  pointsAgainst: number;
  division: Tally;
  conference: Tally;
  /** Chronological. */
  games: GameLine[];
}

export const pct = (tally: Tally): number => {
  const games = tally.w + tally.l + tally.t;
  return games === 0 ? 0 : (tally.w + 0.5 * tally.t) / games;
};

const add = (tally: Tally, result: "W" | "L" | "T"): void => {
  if (result === "W") tally.w += 1;
  else if (result === "L") tally.l += 1;
  else tally.t += 1;
};

const emptyRecord = (team: string): TeamRecord => ({
  team,
  w: 0,
  l: 0,
  t: 0,
  pointsFor: 0,
  pointsAgainst: 0,
  division: { w: 0, l: 0, t: 0 },
  conference: { w: 0, l: 0, t: 0 },
  games: [],
});

/** Won-lost-tied records for every team that appears in `games`, plus any listed in `teams`. */
export function computeRecords(
  games: readonly PlayedGame[],
  teams: readonly string[] = [],
): Map<string, TeamRecord> {
  const records = new Map<string, TeamRecord>();
  const get = (team: string): TeamRecord => {
    let r = records.get(team);
    if (!r) {
      r = emptyRecord(team);
      records.set(team, r);
    }
    return r;
  };
  for (const team of teams) get(team);

  const ordered = [...games].sort((a, b) => a.week - b.week);
  for (const g of ordered) {
    const sides: [string, string, number, number][] = [
      [g.home, g.away, g.homeScore, g.awayScore],
      [g.away, g.home, g.awayScore, g.homeScore],
    ];
    for (const [team, opponent, pointsFor, pointsAgainst] of sides) {
      const result = pointsFor > pointsAgainst ? "W" : pointsFor < pointsAgainst ? "L" : "T";
      const r = get(team);
      add(r, result);
      r.pointsFor += pointsFor;
      r.pointsAgainst += pointsAgainst;
      if (divisionOf(team) === divisionOf(opponent)) add(r.division, result);
      if (conferenceOf(team) === conferenceOf(opponent)) add(r.conference, result);
      r.games.push({ week: g.week, opponent, result, pointsFor, pointsAgainst });
    }
  }
  return records;
}

/** "W3" / "L1" / "T2", or "" before the first game. */
export function streak(record: TeamRecord): string {
  const last = record.games.at(-1);
  if (!last) return "";
  let n = 0;
  for (let i = record.games.length - 1; i >= 0; i -= 1) {
    if (record.games[i]?.result !== last.result) break;
    n += 1;
  }
  return `${last.result}${n}`;
}
