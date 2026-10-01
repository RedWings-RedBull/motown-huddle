import type {
  InjuryLine,
  KeyMatchup,
  MatchupPreview,
  Meeting,
  SideMetrics,
  TeamProfile,
} from "@huddle/shared";
import { MatchupPreview as MatchupPreviewSchema } from "@huddle/shared";

import type { GamesRow, InjuryRow, PbpRow } from "../columns.js";
import { isFinal, toResolvedGame } from "../stages/resolveGame.js";
import { offenseTotals, sideMetrics } from "../stages/teamMetrics.js";

export interface PreviewInputs {
  games: readonly GamesRow[];
  /** Regular-season plays for every completed league week of the season (all 32 teams). */
  pbp: readonly PbpRow[];
  injuries: readonly InjuryRow[];
  team: string;
  season: number;
  now: Date;
}

/** The team's next scheduled game: first row whose kickoff is after `now`. */
export function nextGame(
  games: readonly GamesRow[],
  team: string,
  season: number,
  now: Date,
): GamesRow | null {
  const rows = games
    .filter((g) => g.season === season && (g.home_team === team || g.away_team === team))
    .map((g) => ({ g, k: Date.parse(toResolvedGame(team, g).kickoffUtc) }))
    .filter(({ k }) => k > now.getTime())
    .sort((a, b) => a.k - b.k);
  return rows[0]?.g ?? null;
}

function record(games: readonly GamesRow[], team: string, season: number) {
  const rec = { w: 0, l: 0, t: 0 };
  for (const g of games) {
    if (g.season !== season || g.game_type !== "REG" || !isFinal(g)) continue;
    if (g.home_team !== team && g.away_team !== team) continue;
    const mine = g.home_team === team ? g.home_score : g.away_score;
    const theirs = g.home_team === team ? g.away_score : g.home_score;
    if (mine === null || theirs === null) continue;
    if (mine > theirs) rec.w += 1;
    else if (mine < theirs) rec.l += 1;
    else rec.t += 1;
  }
  return rec;
}

/** Defensive profile: opponents' offense against the team, with percentiles and ranks inverted. */
function invert(m: SideMetrics): SideMetrics {
  const flip = (x: SideMetrics["epaPerPlay"]) => ({
    ...x,
    leaguePercentile: 100 - x.leaguePercentile,
    leagueRank: 33 - x.leagueRank,
  });
  return {
    ...m,
    epaPerPlay: flip(m.epaPerPlay),
    successRate: flip(m.successRate),
    passEpaPerDropback: flip(m.passEpaPerDropback),
    rushEpaPerAtt: flip(m.rushEpaPerAtt),
    explosiveRate: flip(m.explosiveRate),
    sackRate: flip(m.sackRate),
    thirdDownRate: flip(m.thirdDownRate),
  };
}

/** Season-to-date offense and defense of one team with league percentiles and ranks. */
export function teamProfile(
  team: string,
  games: readonly GamesRow[],
  pbp: readonly PbpRow[],
  season: number,
): TeamProfile {
  const offense = sideMetrics(team, offenseTotals(pbp));
  // Attribute every play to the defending team so the same aggregation yields "allowed" numbers.
  const flipped = pbp.map((p) => ({ ...p, posteam: p.defteam, defteam: p.posteam }));
  const defense = invert(sideMetrics(team, offenseTotals(flipped)));
  return { team, record: record(games, team, season), offense, defense };
}

const EDGE_GAP = 8;
function keyMatchups(team: TeamProfile, opp: TeamProfile): KeyMatchup[] {
  const pairs: [string, number, number][] = [
    [
      "Pass offense vs pass defense",
      team.offense.passEpaPerDropback.leagueRank,
      opp.defense.passEpaPerDropback.leagueRank,
    ],
    [
      "Run offense vs run defense",
      team.offense.rushEpaPerAtt.leagueRank,
      opp.defense.rushEpaPerAtt.leagueRank,
    ],
    [
      "Pass defense vs pass offense",
      team.defense.passEpaPerDropback.leagueRank,
      opp.offense.passEpaPerDropback.leagueRank,
    ],
    [
      "Run defense vs run offense",
      team.defense.rushEpaPerAtt.leagueRank,
      opp.offense.rushEpaPerAtt.leagueRank,
    ],
    [
      "Explosive plays",
      team.offense.explosiveRate.leagueRank,
      opp.defense.explosiveRate.leagueRank,
    ],
    ["Third downs", team.offense.thirdDownRate.leagueRank, opp.defense.thirdDownRate.leagueRank],
  ];
  return pairs.map(([label, teamRank, oppRank]) => ({
    label,
    teamRank,
    oppRank,
    // Lower rank is better for both sides, so the smaller number holds the edge.
    edge:
      oppRank - teamRank >= EDGE_GAP
        ? "team"
        : teamRank - oppRank >= EDGE_GAP
          ? "opponent"
          : "even",
  }));
}

function meetings(games: readonly GamesRow[], team: string, opponent: string): Meeting[] {
  return games
    .filter(
      (g) =>
        isFinal(g) &&
        ((g.home_team === team && g.away_team === opponent) ||
          (g.away_team === team && g.home_team === opponent)),
    )
    .sort((a, b) => b.season - a.season || b.week - a.week)
    .slice(0, 5)
    .map((g) => {
      const home = g.home_team === team;
      const teamScore = (home ? g.home_score : g.away_score) ?? 0;
      const oppScore = (home ? g.away_score : g.home_score) ?? 0;
      return {
        season: g.season,
        week: g.week,
        gameId: g.game_id,
        result: teamScore > oppScore ? "W" : teamScore < oppScore ? "L" : "T",
        teamScore,
        oppScore,
        home,
      };
    });
}

/** Pure: builds the next-game preview from schedule, season-to-date plays and injury reports. */
export function buildPreview(inputs: PreviewInputs): MatchupPreview | null {
  const { games, pbp, injuries, team, season, now } = inputs;
  const row = nextGame(games, team, season, now);
  if (row === null) return null;
  const resolved = toResolvedGame(team, row);
  const isHome = resolved.side === "home";
  const opponent = resolved.opponent;
  const throughWeek = Math.max(0, ...pbp.map((p) => p.week));
  const mine = teamProfile(team, games, pbp, season);
  const theirs = teamProfile(opponent, games, pbp, season);

  const injuryWeek = Math.max(
    0,
    ...injuries.filter((i) => i.season === season && i.week <= row.week).map((i) => i.week),
  );
  const injuryLines: InjuryLine[] = injuries
    .filter(
      (i) =>
        i.season === season &&
        i.week === injuryWeek &&
        (i.team === team || i.team === opponent) &&
        i.gsis_id !== null &&
        (i.report_status !== null || i.practice_status !== null),
    )
    .map((i) => ({
      team: i.team,
      gsisId: i.gsis_id ?? "",
      name: i.full_name ?? "",
      position: i.position ?? "",
      reportStatus: i.report_status,
      primary: i.report_primary_injury,
      practiceStatus: i.practice_status,
    }))
    .sort((a, b) => a.team.localeCompare(b.team) || a.name.localeCompare(b.name));

  const spread = row.spread_line === null ? null : isHome ? -row.spread_line : row.spread_line;
  return MatchupPreviewSchema.parse({
    season,
    week: row.week,
    gameId: row.game_id,
    kickoffUtc: resolved.kickoffUtc,
    isHome,
    opponent,
    divGame: row.div_game === 1,
    venue: {
      stadium: row.stadium,
      roof: row.roof,
      surface: row.surface,
      temp: row.temp,
      wind: row.wind,
    },
    // nflverse spread_line is from the home side; expose it from the team's perspective.
    line: { spread, total: row.total_line },
    rest: {
      team: isHome ? row.home_rest : row.away_rest,
      opponent: isHome ? row.away_rest : row.home_rest,
    },
    quarterbacks: {
      team: isHome ? row.home_qb_name : row.away_qb_name,
      opponent: isHome ? row.away_qb_name : row.home_qb_name,
    },
    coaches: {
      team: isHome ? row.home_coach : row.away_coach,
      opponent: isHome ? row.away_coach : row.home_coach,
    },
    referee: row.referee,
    throughWeek,
    team: mine,
    opp: theirs,
    keyMatchups: keyMatchups(mine, theirs),
    injuries: injuryLines,
    lastMeetings: meetings(games, team, opponent),
  });
}
