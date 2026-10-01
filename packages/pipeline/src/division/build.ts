import type { DivisionFile, Standing, TeamProfile } from "@huddle/shared";
import {
  conferenceOf,
  DivisionFile as DivisionFileSchema,
  divisionOf,
  divisionTeams,
} from "@huddle/shared";

import type { GamesRow, PbpRow } from "../columns.js";
import { teamProfile } from "../preview/build.js";
import { isFinal, toResolvedGame } from "../stages/resolveGame.js";
import { simulateSeason, type SimGame } from "./simulate.js";
import { computeRecords, pct, type PlayedGame, streak } from "./standings.js";
import { rankTeams } from "./tiebreak.js";

export interface DivisionInputs {
  games: readonly GamesRow[];
  /** Regular-season plays for every completed league week (all 32 teams). */
  pbp: readonly PbpRow[];
  team: string;
  season: number;
  runs?: number;
  seed?: number;
}

const DEFAULT_RUNS = 10_000;
const DEFAULT_SEED = 20_260_101;

const toPlayed = (g: GamesRow): PlayedGame | null =>
  isFinal(g) && g.home_score !== null && g.away_score !== null
    ? {
        week: g.week,
        home: g.home_team,
        away: g.away_team,
        homeScore: g.home_score,
        awayScore: g.away_score,
      }
    : null;

/** Pure: standings, odds, profiles and upcoming games for the team's division. */
export function buildDivision(inputs: DivisionInputs): DivisionFile {
  const { team, season } = inputs;
  const division = divisionOf(team);
  const members = divisionTeams(division);
  const regular = inputs.games.filter((g) => g.season === season && g.game_type === "REG");
  const played = regular.map(toPlayed).filter((g): g is PlayedGame => g !== null);
  const records = computeRecords(played, members);
  const throughWeek = Math.max(0, ...played.map((g) => g.week));

  const ranked = rankTeams(members, records);
  const standings: Standing[] = ranked.map((r, i) => {
    const rec = records.get(r.team);
    if (!rec) throw new Error(`No record for ${r.team}`);
    return {
      team: r.team,
      rank: i + 1,
      resolvedBy: r.resolvedBy,
      w: rec.w,
      l: rec.l,
      t: rec.t,
      pct: pct(rec),
      division: rec.division,
      conference: rec.conference,
      pointsFor: rec.pointsFor,
      pointsAgainst: rec.pointsAgainst,
      streak: streak(rec),
      lastFive: rec.games
        .slice(-5)
        .reverse()
        .map((g) => g.result),
    };
  });

  const simGames: SimGame[] = regular.map((g) => ({
    week: g.week,
    home: g.home_team,
    away: g.away_team,
    homeScore: isFinal(g) ? g.home_score : null,
    awayScore: isFinal(g) ? g.away_score : null,
    spreadLine: g.spread_line,
  }));
  const runs = inputs.runs ?? DEFAULT_RUNS;
  const seed = inputs.seed ?? DEFAULT_SEED;
  const odds = simulateSeason({ games: simGames, runs, seed, teams: members });

  const profiles: TeamProfile[] = members.map((t) =>
    teamProfile(t, inputs.games, inputs.pbp, season),
  );

  const nextWeek = Math.min(...regular.filter((g) => !isFinal(g)).map((g) => g.week));
  const upcoming = regular
    .filter(
      (g) =>
        g.week === nextWeek && (members.includes(g.home_team) || members.includes(g.away_team)),
    )
    .map((g) => ({
      gameId: g.game_id,
      week: g.week,
      kickoffUtc: toResolvedGame(g.home_team, g).kickoffUtc,
      home: g.home_team,
      away: g.away_team,
      divGame: g.div_game === 1,
      spread: g.spread_line,
    }))
    .sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc) || a.gameId.localeCompare(b.gameId));

  return DivisionFileSchema.parse({
    season,
    division,
    conference: conferenceOf(team),
    throughWeek,
    standings,
    odds,
    simulation: { runs, seed, gamesRemaining: simGames.filter((g) => g.homeScore === null).length },
    profiles,
    upcoming,
  });
}
