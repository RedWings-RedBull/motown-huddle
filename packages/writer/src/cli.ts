import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { ArticleType } from "@huddle/shared";

import { buildBundle, latestWeek } from "./bundle.js";
import { claudeCodeClient, type ModelClient } from "./model.js";
import { analystPrompt, analystSystem } from "./prompts.js";
import { ARTICLE_TYPES, runWriter, type WriterLog } from "./run.js";

const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const DATA_DIR = join(REPO, "apps/web/src/data");
const CONTENT_DIR = join(REPO, "apps/web/src/content/articles");
const OUT_DIR = join(REPO, "packages/writer/out");

const USAGE = `usage: pnpm writer [--season <yyyy> --week <n>] [--type recap,division,preview] [--force] [--dry-run]
  --season/--week  which week to write about (default: the newest week in the manifest)
  --type           which articles (default: all three)
  --force          rewrite even when the data has not changed
  --dry-run        write the data bundles and prompts to packages/writer/out/ without calling a model
  --model          Claude model alias or name (default: $HUDDLE_WRITER_MODEL or "sonnet")
  --effort         low | medium | high | xhigh | max (default: $HUDDLE_WRITER_EFFORT or "high")`;

const consoleLog: WriterLog = {
  info: (m) => {
    console.log(`[writer] ${m}`);
  },
  warn: (m) => {
    console.warn(`[writer] ${m}`);
  },
};

export interface CliDeps {
  client?: (model: string, effort: string) => ModelClient;
  log?: WriterLog;
  dataDir?: string;
  contentDir?: string;
  outDir?: string;
  env?: NodeJS.ProcessEnv;
}

export async function main(argv: readonly string[], deps: CliDeps = {}): Promise<number> {
  const log = deps.log ?? consoleLog;
  const env = deps.env ?? process.env;
  let values;
  try {
    ({ values } = parseArgs({
      args: [...argv],
      options: {
        season: { type: "string" },
        week: { type: "string" },
        type: { type: "string" },
        force: { type: "boolean", default: false },
        "dry-run": { type: "boolean", default: false },
        model: { type: "string" },
        effort: { type: "string" },
        help: { type: "boolean", default: false },
      },
    }));
  } catch (e) {
    log.warn(e instanceof Error ? e.message : String(e));
    log.warn(USAGE);
    return 2;
  }
  if (values.help) {
    log.info(USAGE);
    return 0;
  }

  const dataDir = deps.dataDir ?? DATA_DIR;
  const types = (values.type ?? ARTICLE_TYPES.join(","))
    .split(",")
    .map((t) => ArticleType.parse(t.trim()));
  const season = values.season === undefined ? undefined : Number(values.season);
  const week =
    values.week === undefined || values.week === "auto" ? undefined : Number(values.week);
  if ((season === undefined) !== (week === undefined)) {
    log.warn("--season and --week go together (or leave both out for the newest week)");
    return 2;
  }
  const model = values.model ?? env.HUDDLE_WRITER_MODEL ?? "sonnet";
  const effort = values.effort ?? env.HUDDLE_WRITER_EFFORT ?? "high";

  if (values["dry-run"]) {
    const target =
      season !== undefined && week !== undefined ? { season, week } : latestWeek(dataDir);
    const outDir = deps.outDir ?? OUT_DIR;
    mkdirSync(outDir, { recursive: true });
    for (const type of types) {
      const bundle = buildBundle(type, dataDir, target.season, target.week);
      const file = join(
        outDir,
        `${String(bundle.season)}-w${String(bundle.week).padStart(2, "0")}-${type}.txt`,
      );
      writeFileSync(file, `SYSTEM:\n${analystSystem(type)}\n\nUSER:\n${analystPrompt(bundle)}\n`);
      log.info(`${type}: prompt written to ${file}`);
    }
    return 0;
  }

  if (env.GITHUB_ACTIONS === "true" && !env.CLAUDE_CODE_OAUTH_TOKEN && !env.ANTHROPIC_API_KEY) {
    log.warn("no CLAUDE_CODE_OAUTH_TOKEN secret is set; skipping the articles");
    return 0;
  }

  const makeClient = deps.client ?? ((m, e) => claudeCodeClient({ model: m, effort: e }));
  try {
    const result = await runWriter({
      dataDir,
      contentDir: deps.contentDir ?? CONTENT_DIR,
      client: makeClient(model, effort),
      model,
      effort,
      types,
      force: values.force,
      log,
      ...(season !== undefined && week !== undefined ? { season, week } : {}),
    });
    log.info(
      `done: ${String(result.written.length)} written, ${String(result.skipped.length)} unchanged, ${String(result.failed.length)} not written`,
    );
    return result.failed.length > 0 ? 1 : 0;
  } catch (e) {
    log.warn(e instanceof Error ? e.message : String(e));
    return 1;
  }
}

/* c8 ignore start -- process entry point */
if (process.argv[1] !== undefined && /cli\.(ts|js)$/.test(process.argv[1])) {
  // Local runs read the repo's git-ignored .env; variables already set (CI secrets) win.
  const envFile = join(REPO, ".env");
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  process.exitCode = await main(process.argv.slice(2));
}
/* c8 ignore stop */
