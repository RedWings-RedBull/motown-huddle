/**
 * NFL division tiebreaking procedure, steps 1–10 and a deterministic stand-in for the coin toss.
 * Step 11 (net touchdowns) is not computed; the schedule data does not carry touchdown counts.
 *
 * Two clubs walk the steps in order. Three or more clubs apply each step to the whole group; when
 * a step separates the group, the leaders and the rest each restart from step 1 (the league's
 * "revert to step 1" rule), which is what the recursion below does.
 */
import { conferenceOf, conferenceTeams } from "@huddle/shared";

import { pct, type Tally, type TeamRecord } from "./standings.js";

export interface Ranked {
  team: string;
  /** Name of the step that settled this club's place; null when the record alone did. */
  resolvedBy: string | null;
}

interface Step {
  name: string;
  /** Higher is better. Return null to mark the step as not applicable for this group. */
  value: (
    team: TeamRecord,
    group: readonly TeamRecord[],
    all: Map<string, TeamRecord>,
  ) => number | null;
}

const tallyOf = (games: readonly TeamRecord["games"][number][]): Tally => {
  const t = { w: 0, l: 0, t: 0 };
  for (const g of games) {
    if (g.result === "W") t.w += 1;
    else if (g.result === "L") t.l += 1;
    else t.t += 1;
  }
  return t;
};

const gamesAgainst = (team: TeamRecord, opponents: ReadonlySet<string>) =>
  team.games.filter((g) => opponents.has(g.opponent));

const commonOpponents = (group: readonly TeamRecord[]): Set<string> => {
  const sets = group.map((t) => new Set(t.games.map((g) => g.opponent)));
  const first = sets[0] ?? new Set<string>();
  const common = new Set<string>();
  for (const opp of first) {
    if (sets.every((s) => s.has(opp)) && !group.some((t) => t.team === opp)) common.add(opp);
  }
  return common;
};

/** Combined record of a set of opponents, each counted once per game played against it. */
const combined = (
  team: TeamRecord,
  all: Map<string, TeamRecord>,
  filter: (g: TeamRecord["games"][number]) => boolean,
) => {
  const t = { w: 0, l: 0, t: 0 };
  for (const g of team.games) {
    if (!filter(g)) continue;
    const opp = all.get(g.opponent);
    if (!opp) continue;
    t.w += opp.w;
    t.l += opp.l;
    t.t += opp.t;
  }
  return pct(t);
};

/** Combined rank in points scored (desc) and points allowed (asc) among `teams`; lower is better. */
const pointsRank = (
  team: TeamRecord,
  teams: readonly string[],
  all: Map<string, TeamRecord>,
): number => {
  const pool = teams.map((t) => all.get(t)).filter((r): r is TeamRecord => r !== undefined);
  const scoredRank = 1 + pool.filter((r) => r.pointsFor > team.pointsFor).length;
  const allowedRank = 1 + pool.filter((r) => r.pointsAgainst < team.pointsAgainst).length;
  return scoredRank + allowedRank;
};

const DIVISION_STEPS: readonly Step[] = [
  {
    name: "head-to-head",
    value: (team, group) => {
      const others = new Set(group.filter((t) => t !== team).map((t) => t.team));
      const games = gamesAgainst(team, others);
      return games.length === 0 ? null : pct(tallyOf(games));
    },
  },
  { name: "division record", value: (team) => pct(team.division) },
  {
    name: "common games",
    value: (team, group) => {
      const common = commonOpponents(group);
      const games = gamesAgainst(team, common);
      // Two clubs need at least four common games for the step to apply.
      if (group.length === 2 && group.some((t) => gamesAgainst(t, common).length < 4)) return null;
      return games.length === 0 ? null : pct(tallyOf(games));
    },
  },
  { name: "conference record", value: (team) => pct(team.conference) },
  {
    name: "strength of victory",
    value: (team, _g, all) => combined(team, all, (g) => g.result === "W"),
  },
  { name: "strength of schedule", value: (team, _g, all) => combined(team, all, () => true) },
  {
    name: "conference points ranking",
    value: (team, _g, all) => -pointsRank(team, conferenceTeams(conferenceOf(team.team)), all),
  },
  {
    name: "league points ranking",
    value: (team, _g, all) => -pointsRank(team, [...all.keys()], all),
  },
  {
    name: "net points in common games",
    value: (team, group) => {
      const games = gamesAgainst(team, commonOpponents(group));
      return games.length === 0
        ? null
        : games.reduce((s, g) => s + g.pointsFor - g.pointsAgainst, 0);
    },
  },
  { name: "net points", value: (team) => team.pointsFor - team.pointsAgainst },
  {
    // Step 11 (net touchdowns) is unavailable; step 12 is a coin toss, replaced by a stable order.
    name: "coin toss (alphabetical placeholder)",
    value: (team) => -team.team.charCodeAt(0) * 1000 - team.team.charCodeAt(1),
  },
];

/** Orders a group of clubs tied on winning percentage. */
function breakTie(
  group: readonly TeamRecord[],
  all: Map<string, TeamRecord>,
  steps = DIVISION_STEPS,
): Ranked[] {
  if (group.length === 1) return [{ team: group[0]?.team ?? "", resolvedBy: null }];
  for (const step of steps) {
    const values = group.map((t) => step.value(t, group, all));
    if (values.some((v) => v === null)) continue;
    const best = Math.max(...(values as number[]));
    const leaders = group.filter((_, i) => values[i] === best);
    if (leaders.length === group.length) continue;
    const rest = group.filter((_, i) => values[i] !== best);
    const stamp = (ranked: Ranked[]): Ranked[] =>
      ranked.map((r) => ({ team: r.team, resolvedBy: r.resolvedBy ?? step.name }));
    return [...stamp(breakTie(leaders, all, steps)), ...stamp(breakTie(rest, all, steps))];
  }
  return group.map((t) => ({ team: t.team, resolvedBy: "unresolved" }));
}

/** Division order: winning percentage first, ties broken by the procedure above. */
export function rankTeams(
  teams: readonly string[],
  all: Map<string, TeamRecord>,
  steps = DIVISION_STEPS,
): Ranked[] {
  const records = teams.map((t) => all.get(t)).filter((r): r is TeamRecord => r !== undefined);
  const byPct = new Map<number, TeamRecord[]>();
  for (const r of records) {
    const key = Math.round(pct(r) * 1e6);
    byPct.set(key, [...(byPct.get(key) ?? []), r]);
  }
  const keys = [...byPct.keys()].sort((a, b) => b - a);
  return keys.flatMap((k) => breakTie(byPct.get(k) ?? [], all, steps));
}

/** Wild-card ordering: the same steps minus head-to-head sweep nuances, documented as simplified. */
export const WILDCARD_STEPS: readonly Step[] = DIVISION_STEPS.filter(
  (s) => s.name !== "division record",
);
