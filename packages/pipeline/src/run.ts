import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { GradeRequest, teamConfig, type Tier, type WeekMeta } from "@huddle/shared";

import { checkCrosswalk } from "./crosswalk.js";
import type { Engine } from "./engine.js";
import { ValidationError } from "./errors.js";
import { PIPELINE_VERSION } from "./version.js";
import type { WeekInputs } from "./inputs.js";
import { loadWeekInputs, type LoadOptions } from "./load.js";
import { silentLogger, type Logger } from "./log.js";
import { extract } from "./stages/extract.js";
import { gameSummary } from "./stages/gameSummary.js";
import { gapHeat } from "./stages/gapHeat.js";
import { keyPlays } from "./stages/keyPlays.js";
import { assertReady } from "./stages/readiness.js";
import type { ResolvedGame } from "./stages/resolveGame.js";
import { assignSlots, gameReturners, participants } from "./stages/slots.js";
import { teamMetrics } from "./stages/teamMetrics.js";
import { winProbability } from "./stages/winProbability.js";
import { rebuildManifest, stableJson, writeWeek, type WeekArtifacts } from "./stages/write.js";

/** apps/web/src/data, resolved from this package so the CLI works from any cwd. */
export const DEFAULT_DATA_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "apps",
  "web",
  "src",
  "data",
);

export interface BuildResult {
  request: GradeRequest;
  artifacts: WeekArtifacts;
}

/**
 * Pure assembly of one week from loaded inputs: readiness gate, crosswalk check, extraction, slot
 * assignment, engine call and artifact construction. No I/O, so tests drive it from fixtures.
 */
export function buildWeek(
  inputs: WeekInputs,
  engine: Engine,
  log: Logger = silentLogger,
): BuildResult {
  const { team, game, tier } = inputs;
  const gameId = game.gameId;
  assertReady(tier, gameId, {
    pbpRows: inputs.pbp.filter((p) => p.game_id === gameId).length,
    snapRows: inputs.snaps.filter((s) => s.game_id === gameId).length,
    pfrDefRows: inputs.pfr?.def.filter((r) => r.game_id === gameId).length ?? 0,
    pfrPassRows: inputs.pfr?.pass.filter((r) => r.game_id === gameId).length ?? 0,
  });

  const teamSnaps = inputs.snaps.filter((s) => s.team === team && s.game_id === gameId);
  const teamPfr = inputs.pfr
    ? [...inputs.pfr.pass, ...inputs.pfr.rush, ...inputs.pfr.rec, ...inputs.pfr.def].filter(
        (r) => r.team === team && r.game_id === gameId,
      )
    : [];
  const check = checkCrosswalk(inputs.crosswalk, [...teamSnaps, ...teamPfr]);
  if (check.unmatched.length > 0) {
    log.warn(
      `crosswalk: ${check.unmatched.length} team rows unmatched: ${check.unmatched.join(", ")}`,
    );
  }
  if (inputs.ftn.length === 0)
    log.warn("FTN charting has no rows for the week; FTN metrics are null");
  if (inputs.ngs.passing.length + inputs.ngs.rushing.length + inputs.ngs.receiving.length === 0) {
    log.warn("NGS has no rows for the week; NGS metrics fall back or stay null");
  }

  const extracted = extract(inputs);
  const people = participants(inputs.snaps, team, gameId, inputs.crosswalk);
  const assignments = assignSlots(
    inputs.depthCharts,
    team,
    game.kickoffUtc,
    people,
    gameReturners(inputs.pbp, gameId, team),
  );
  const request = GradeRequest.parse({
    season: inputs.season,
    week: inputs.week,
    gameId,
    team,
    tier,
    players: extracted.players,
    units: extracted.units,
    assignments,
    gapHeat: gapHeat(inputs.pbp, gameId, team),
  });
  log.info(
    `extracted ${request.players.length} players, ${request.units.length} OL units, ${assignments.length} slot assignments`,
  );

  const { grades, baselines } = engine.gradeWeek(request);
  const meta: WeekMeta = {
    season: inputs.season,
    week: inputs.week,
    gameId,
    tier,
    pipelineVersion: PIPELINE_VERSION,
    gradesVersion: engine.gradesVersion,
    sources: inputs.sources,
  };
  const artifacts: WeekArtifacts = {
    game: gameSummary(game, tier),
    teamMetrics: teamMetrics(inputs.pbp, {
      season: inputs.season,
      week: inputs.week,
      gameId,
      tier,
      team,
      opponent: game.opponent,
    }),
    grades,
    keyPlays: keyPlays(inputs.pbp, { season: inputs.season, week: inputs.week, gameId, team }),
    winProbability: winProbability(inputs.pbp, {
      season: inputs.season,
      week: inputs.week,
      gameId,
      team,
      side: game.side,
    }),
    meta,
    leagueBaselines: baselines,
  };
  return { request, artifacts };
}

export interface RunOptions extends LoadOptions {
  season: number;
  /** Explicit week, or "auto" for the latest completed team game. */
  week: number | "auto";
  tier: Tier;
  dataDir?: string;
  /** Writes the GradeRequest and engine output under packages/pipeline/out/fixtures. */
  dumpFixture?: boolean;
  engine: Engine;
  log?: Logger;
  now?: Date;
  team?: string;
}

export interface RunOutcome {
  status: "written" | "bye";
  game: ResolvedGame | null;
  files: string[];
}

/** Loads one week from the cache/network, builds it, writes artifacts and rebuilds the manifest. */
export async function runWeek(options: RunOptions): Promise<RunOutcome> {
  const log = options.log ?? silentLogger;
  const team = options.team ?? teamConfig.team;
  const loaded = await loadWeekInputs({ ...options, team, log });
  if (loaded === null) {
    log.info(`${team} has no game in ${options.season} week ${String(options.week)} (bye)`);
    return { status: "bye", game: null, files: [] };
  }
  const dataDir = options.dataDir ?? DEFAULT_DATA_DIR;
  const { request, artifacts } = buildWeek(loaded, options.engine, log);
  const files = await writeWeek(dataDir, loaded.season, loaded.week, artifacts);
  await rebuildManifest(dataDir);
  if (options.dumpFixture === true) files.push(...(await dumpFixture(loaded, request, artifacts)));
  log.info(`wrote ${files.length} files for ${loaded.game.gameId} (${loaded.tier})`);
  return { status: "written", game: loaded.game, files };
}

async function dumpFixture(
  inputs: WeekInputs,
  request: GradeRequest,
  artifacts: WeekArtifacts,
): Promise<string[]> {
  const dir = join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "out",
    "fixtures",
    `${inputs.season}-w${String(inputs.week).padStart(2, "0")}`,
  );
  await mkdir(dir, { recursive: true });
  const input = join(dir, "input.json");
  const expected = join(dir, "expected.json");
  await writeFile(input, stableJson(request));
  await writeFile(
    expected,
    stableJson({ grades: artifacts.grades, baselines: artifacts.leagueBaselines }),
  );
  return [input, expected];
}

/** Parses "1-18" / "3" / "2,5" into a sorted list of weeks. */
export function parseWeeks(spec: string): number[] {
  const weeks = new Set<number>();
  for (const part of spec.split(",")) {
    const range = /^(\d+)(?:-(\d+))?$/.exec(part.trim());
    if (!range) throw new ValidationError(`bad --weeks "${spec}"`);
    const from = Number(range[1]);
    const to = range[2] === undefined ? from : Number(range[2]);
    if (to < from) throw new ValidationError(`bad --weeks range "${part}"`);
    for (let w = from; w <= to; w += 1) weeks.add(w);
  }
  return [...weeks].sort((a, b) => a - b);
}
