import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { gradesEngine } from "./engine.js";
import {
  EXIT_NOT_READY,
  EXIT_OK,
  EXIT_VALIDATION,
  NotReadyError,
  ValidationError,
} from "./errors.js";
import { consoleLogger, type Logger } from "./log.js";
import { fitFgTable, type FitOptions } from "./models/fitFgTable.js";
import { type CoachRunOptions, runCoach } from "./coach/run.js";
import { type DivisionRunOptions, runDivision } from "./division/run.js";
import { type HighlightsRunOptions, runHighlights } from "./highlights/run.js";
import { type PreviewRunOptions, runPreview } from "./preview/run.js";
import { type RosterRunOptions, runRoster } from "./roster/run.js";
import { DEFAULT_DATA_DIR, parseWeeks, runWeek, type RunOptions } from "./run.js";
import { PIPELINE_VERSION } from "./version.js";

export const USAGE = `huddle pipeline ${PIPELINE_VERSION}
usage: pnpm pipeline --season <yyyy> (--week <n>|auto | --weeks <a-b>) [--final] [--refresh] [--dump-fixture]
       pnpm pipeline --fit-fg-table

  --season        NFL season (required unless --fit-fg-table)
  --week          week number, or "auto" for the latest completed game (default: auto)
  --weeks         backfill a range, e.g. 1-18 (byes are skipped)
  --final         Final tier: also requires PFR advanced stats (default: provisional)
  --refresh       ignore the download cache
  --dump-fixture  also write the GradeRequest and engine output under packages/pipeline/out
  --data-dir      override apps/web/src/data (tests)
  --highlights    find the league's game-highlights video for --week (needs HUDDLE_YOUTUBE_API_KEY)
  --coach         build apps/web/src/data/coach/current.json (fourth-down data) and exit
  --division      build apps/web/src/data/division/current.json (standings, odds) and exit
  --preview       build apps/web/src/data/preview/next.json for the next game and exit
  --roster        build apps/web/src/data/roster/current.json for --season and exit
  --fit-fg-table  refit src/models/fg-make.json from 2021-2025 play-by-play and exit

exit codes: 0 ok, 2 validation failure, 3 data not ready yet`;

export type CliArgs =
  | { command: "help" }
  | { command: "fit-fg-table"; refresh: boolean }
  | { command: "roster"; season: number; refresh: boolean; dataDir: string | undefined }
  | { command: "preview"; season: number; refresh: boolean; dataDir: string | undefined }
  | { command: "division"; season: number; refresh: boolean; dataDir: string | undefined }
  | { command: "coach"; season: number; refresh: boolean; dataDir: string | undefined }
  | {
      command: "highlights";
      season: number;
      week: number | "auto";
      refresh: boolean;
      dataDir: string | undefined;
    }
  | {
      command: "week";
      season: number;
      week: number | "auto";
      weeks: number[] | null;
      tier: "provisional" | "final";
      refresh: boolean;
      dumpFixture: boolean;
      dataDir: string | undefined;
    };

export function parseCli(argv: readonly string[]): CliArgs {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      season: { type: "string" },
      week: { type: "string", default: "auto" },
      weeks: { type: "string" },
      final: { type: "boolean", default: false },
      refresh: { type: "boolean", default: false },
      "dump-fixture": { type: "boolean", default: false },
      "data-dir": { type: "string" },
      "fit-fg-table": { type: "boolean", default: false },
      roster: { type: "boolean", default: false },
      preview: { type: "boolean", default: false },
      division: { type: "boolean", default: false },
      coach: { type: "boolean", default: false },
      highlights: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    strict: true,
  });
  if (values.help) return { command: "help" };
  if (values["fit-fg-table"]) return { command: "fit-fg-table", refresh: values.refresh };
  const season = Number(values.season);
  if (!Number.isInteger(season) || season < 1999) {
    throw new ValidationError(`--season is required (got "${values.season ?? ""}")\n${USAGE}`);
  }
  if (values.coach) {
    return { command: "coach", season, refresh: values.refresh, dataDir: values["data-dir"] };
  }
  if (values.division) {
    return { command: "division", season, refresh: values.refresh, dataDir: values["data-dir"] };
  }
  if (values.preview) {
    return { command: "preview", season, refresh: values.refresh, dataDir: values["data-dir"] };
  }
  if (values.roster) {
    return { command: "roster", season, refresh: values.refresh, dataDir: values["data-dir"] };
  }
  let week: number | "auto" = "auto";
  if (values.week !== "auto") {
    week = Number(values.week);
    if (!Number.isInteger(week) || week < 1 || week > 22) {
      throw new ValidationError(`--week must be 1-22 or auto (got "${values.week}")`);
    }
  }
  if (values.highlights) {
    return {
      command: "highlights",
      season,
      week,
      refresh: values.refresh,
      dataDir: values["data-dir"],
    };
  }
  return {
    command: "week",
    season,
    week,
    weeks: values.weeks === undefined ? null : parseWeeks(values.weeks),
    tier: values.final ? "final" : "provisional",
    refresh: values.refresh,
    dumpFixture: values["dump-fixture"],
    dataDir: values["data-dir"],
  };
}

export type Runner = (options: RunOptions) => Promise<{ status: "written" | "bye" }>;
export type Fitter = (options: FitOptions) => Promise<unknown>;
export type RosterRunner = (options: RosterRunOptions) => Promise<unknown>;
export type PreviewRunner = (options: PreviewRunOptions) => Promise<unknown>;
export type DivisionRunner = (options: DivisionRunOptions) => Promise<unknown>;
export type CoachRunner = (options: CoachRunOptions) => Promise<unknown>;
export type HighlightsRunner = (options: HighlightsRunOptions) => Promise<unknown>;

export interface CliDeps {
  run?: Runner;
  fit?: Fitter;
  roster?: RosterRunner;
  preview?: PreviewRunner;
  division?: DivisionRunner;
  coach?: CoachRunner;
  highlights?: HighlightsRunner;
  log?: Logger;
  engine?: RunOptions["engine"];
}

/** Runs the CLI and returns the process exit code. */
export async function main(argv: readonly string[], deps: CliDeps = {}): Promise<number> {
  const log = deps.log ?? consoleLogger;
  const run = deps.run ?? runWeek;
  const fit = deps.fit ?? fitFgTable;
  const roster = deps.roster ?? runRoster;
  const preview = deps.preview ?? runPreview;
  const division = deps.division ?? runDivision;
  const coach = deps.coach ?? runCoach;
  const highlights = deps.highlights ?? runHighlights;
  try {
    const args = parseCli(argv);
    if (args.command === "help") {
      log.info(USAGE);
      return EXIT_OK;
    }
    if (args.command === "highlights") {
      await highlights({
        season: args.season,
        week: args.week,
        refresh: args.refresh,
        dataDir: args.dataDir ?? DEFAULT_DATA_DIR,
        apiKey: process.env.HUDDLE_YOUTUBE_API_KEY,
        log,
      });
      return 0;
    }
    if (args.command === "coach") {
      await coach({
        season: args.season,
        refresh: args.refresh,
        dataDir: args.dataDir ?? DEFAULT_DATA_DIR,
        log,
      });
      return 0;
    }
    if (args.command === "division") {
      await division({
        season: args.season,
        refresh: args.refresh,
        dataDir: args.dataDir ?? DEFAULT_DATA_DIR,
        log,
      });
      return 0;
    }
    if (args.command === "preview") {
      await preview({
        season: args.season,
        refresh: args.refresh,
        dataDir: args.dataDir ?? DEFAULT_DATA_DIR,
        log,
      });
      return 0;
    }
    if (args.command === "roster") {
      await roster({
        season: args.season,
        refresh: args.refresh,
        dataDir: args.dataDir ?? DEFAULT_DATA_DIR,
        log,
      });
      return 0;
    }
    if (args.command === "fit-fg-table") {
      await fit({ refresh: args.refresh, log });
      return EXIT_OK;
    }
    const base = {
      season: args.season,
      tier: args.tier,
      refresh: args.refresh,
      dumpFixture: args.dumpFixture,
      engine: deps.engine ?? gradesEngine,
      log,
      ...(args.dataDir === undefined ? {} : { dataDir: args.dataDir }),
    };
    const weeks: (number | "auto")[] = args.weeks ?? [args.week];
    let notReady = 0;
    for (const week of weeks) {
      try {
        await run({ ...base, week });
      } catch (error) {
        // A backfill keeps going past weeks whose data is not posted yet.
        if (error instanceof NotReadyError && weeks.length > 1) {
          log.warn(error.message);
          notReady += 1;
          continue;
        }
        throw error;
      }
    }
    if (notReady > 0) log.warn(`${notReady} of ${weeks.length} weeks not ready`);
    return EXIT_OK;
  } catch (error) {
    if (error instanceof NotReadyError) {
      log.warn(`not ready: ${error.message}`);
      return EXIT_NOT_READY;
    }
    if (error instanceof ValidationError) {
      log.warn(error.message);
      return EXIT_VALIDATION;
    }
    log.warn(error instanceof Error ? (error.stack ?? error.message) : String(error));
    return EXIT_VALIDATION;
  }
}

/* c8 ignore start -- process entry point */
if (process.argv[1] !== undefined && /cli\.(ts|js)$/.test(process.argv[1])) {
  // Local runs read the repo's git-ignored .env; variables already set (CI secrets) win.
  const envFile = fileURLToPath(new URL("../../../.env", import.meta.url));
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  process.exitCode = await main(process.argv.slice(2));
}
/* c8 ignore stop */
