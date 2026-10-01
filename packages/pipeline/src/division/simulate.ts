/**
 * Seeded Monte Carlo of the rest of the regular season. Each unplayed game is decided by a
 * coin weighted by the published spread when one exists, else by a point-differential rating.
 */
import { ALL_TEAMS, conferenceTeams, DIVISIONS, type Division } from "@huddle/shared";

import { computeRecords, type PlayedGame } from "./standings.js";
import { rankTeams, WILDCARD_STEPS } from "./tiebreak.js";

export interface SimGame {
  week: number;
  home: string;
  away: string;
  homeScore: number | null;
  awayScore: number | null;
  /** Home-side spread, positive when the home team is favoured. */
  spreadLine: number | null;
}

/** Deterministic 32-bit PRNG (Tommy Ettinger's mulberry32). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal CDF (Abramowitz & Stegun 7.1.26, |error| < 1.5e-7). */
export function normalCdf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const poly =
    t *
    (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-z * z);
  return 0.5 * (1 + sign * erf);
}

/** NFL margin of victory has a standard deviation of roughly 13.86 points. */
const MARGIN_SD = 13.86;
const HOME_EDGE = 2.0;

/** Point-differential ratings regressed one third toward zero. */
function ratings(played: readonly PlayedGame[]): Map<string, number> {
  const records = computeRecords(played, ALL_TEAMS);
  const out = new Map<string, number>();
  for (const [team, r] of records) {
    const games = r.w + r.l + r.t;
    out.set(team, games === 0 ? 0 : ((r.pointsFor - r.pointsAgainst) / games) * (2 / 3));
  }
  return out;
}

export function homeWinProbability(game: SimGame, rating: Map<string, number>): number {
  if (game.spreadLine !== null) return normalCdf(game.spreadLine / MARGIN_SD);
  const diff = (rating.get(game.home) ?? 0) - (rating.get(game.away) ?? 0) + HOME_EDGE;
  return normalCdf(diff / MARGIN_SD);
}

export interface SimSummary {
  team: string;
  division: number;
  playoffs: number;
  expectedWins: number;
  winDistribution: number[];
}

export interface SimulateOptions {
  games: readonly SimGame[];
  runs: number;
  seed: number;
  /** Teams to report on. */
  teams: readonly string[];
}

const isPlayed = (g: SimGame): g is SimGame & { homeScore: number; awayScore: number } =>
  g.homeScore !== null && g.awayScore !== null;

/** Seven playoff clubs per conference: four division winners plus three wild cards. */
function playoffTeams(records: ReturnType<typeof computeRecords>): Set<string> {
  const out = new Set<string>();
  for (const conference of ["AFC", "NFC"] as const) {
    const winners: string[] = [];
    for (const [division, teams] of Object.entries(DIVISIONS) as [Division, readonly string[]][]) {
      if (!division.startsWith(conference)) continue;
      const first = rankTeams(teams, records)[0];
      if (first) winners.push(first.team);
    }
    for (const w of winners) out.add(w);
    const rest = conferenceTeams(conference).filter((t) => !out.has(t));
    const ordered = rankTeams(rest, records, WILDCARD_STEPS);
    for (const r of ordered.slice(0, 3)) out.add(r.team);
  }
  return out;
}

/** Runs the simulation and returns per-team odds for the requested clubs. */
export function simulateSeason(options: SimulateOptions): SimSummary[] {
  const played = options.games.filter(isPlayed);
  const remaining = options.games.filter((g) => !isPlayed(g));
  const rating = ratings(played);
  const probs = remaining.map((g) => homeWinProbability(g, rating));
  const random = mulberry32(options.seed);
  const maxGames = 17;

  const tallies = new Map(
    options.teams.map((t) => [
      t,
      { division: 0, playoffs: 0, wins: 0, dist: new Array<number>(maxGames + 1).fill(0) },
    ]),
  );
  const divisionOfTeam = (team: string): readonly string[] =>
    (Object.values(DIVISIONS) as readonly (readonly string[])[]).find((d) => d.includes(team)) ??
    [];

  for (let run = 0; run < options.runs; run += 1) {
    const simulated: PlayedGame[] = remaining.map((g, i) => {
      const homeWins = random() < (probs[i] ?? 0.5);
      return {
        week: g.week,
        home: g.home,
        away: g.away,
        homeScore: homeWins ? 1 : 0,
        awayScore: homeWins ? 0 : 1,
      };
    });
    const records = computeRecords([...played, ...simulated], ALL_TEAMS);
    const playoffs = playoffTeams(records);
    for (const [team, tally] of tallies) {
      const r = records.get(team);
      if (!r) continue;
      const first = rankTeams(divisionOfTeam(team), records)[0]?.team;
      if (first === team) tally.division += 1;
      if (playoffs.has(team)) tally.playoffs += 1;
      tally.wins += r.w + 0.5 * r.t;
      const bucket = Math.min(maxGames, Math.round(r.w + 0.5 * r.t));
      tally.dist[bucket] = (tally.dist[bucket] ?? 0) + 1;
    }
  }

  const n = options.runs;
  return options.teams.map((team) => {
    const t = tallies.get(team) ?? { division: 0, playoffs: 0, wins: 0, dist: [] };
    return {
      team,
      division: t.division / n,
      playoffs: t.playoffs / n,
      expectedWins: t.wins / n,
      winDistribution: t.dist.map((c) => c / n),
    };
  });
}
