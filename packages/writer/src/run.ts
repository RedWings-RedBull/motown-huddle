import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { ArticleFrontmatter, type ArticleType } from "@huddle/shared";
import { z } from "zod";

import { type Bundle, buildBundle, bundleHash, latestWeek } from "./bundle.js";
import { articleStem, linkPlays, renderArticle, storedHash } from "./emit.js";
import { checkArticle, type GroundingReport } from "./ground.js";
import type { ModelClient } from "./model.js";
import {
  analystPrompt,
  analystSystem,
  ARTICLE_SCHEMA,
  editorPrompt,
  editorSystem,
} from "./prompts.js";

export const ARTICLE_TYPES: readonly ArticleType[] = ["recap", "division", "preview"];

const Draft = z.object({ title: z.string(), description: z.string(), body: z.string() });
type Draft = z.infer<typeof Draft>;

export interface WriterLog {
  info(message: string): void;
  warn(message: string): void;
}

export interface WriterOptions {
  dataDir: string;
  contentDir: string;
  client: ModelClient;
  model: string;
  effort: string;
  /** Defaults to the newest week in the manifest. */
  season?: number;
  week?: number;
  types?: readonly ArticleType[];
  /** Rewrite even when the data has not changed since the last article. */
  force?: boolean;
  now?: Date;
  log?: WriterLog;
}

export interface WriterResult {
  written: string[];
  skipped: string[];
  failed: { type: ArticleType; violations: string[] }[];
  costUsd: number;
}

/** Editor passes after the first draft; each one sees the checker's remaining violations. */
const EDITOR_PASSES = 2;

function articlePath(contentDir: string, bundle: Bundle): string {
  return join(contentDir, String(bundle.season), `${articleStem(bundle.week, bundle.type)}.md`);
}

async function ask(
  client: ModelClient,
  system: string,
  prompt: string,
): Promise<{ draft: Draft; cost: number }> {
  const response = await client({ system, prompt, schema: ARTICLE_SCHEMA });
  return { draft: Draft.parse(response.output), cost: response.costUsd ?? 0 };
}

/** Draft, check, edit, check again: the article is written only when the checker finds nothing. */
async function writeOne(
  bundle: Bundle,
  options: WriterOptions,
): Promise<{ draft: Draft; report: GroundingReport; cost: number }> {
  const { client } = options;
  let { draft, cost } = await ask(client, analystSystem(bundle.type), analystPrompt(bundle));
  let report = checkArticle(draft, bundle);
  for (let pass = 0; pass < EDITOR_PASSES; pass += 1) {
    const edited = await ask(
      client,
      editorSystem(bundle.type),
      editorPrompt(bundle, draft, report.violations),
    );
    draft = edited.draft;
    cost += edited.cost;
    report = checkArticle(draft, bundle);
    if (report.violations.length === 0) break;
  }
  return { draft, report, cost };
}

export async function runWriter(options: WriterOptions): Promise<WriterResult> {
  const log = options.log ?? { info: () => undefined, warn: () => undefined };
  const target =
    options.season !== undefined && options.week !== undefined
      ? { season: options.season, week: options.week }
      : latestWeek(options.dataDir);
  const result: WriterResult = { written: [], skipped: [], failed: [], costUsd: 0 };

  for (const type of options.types ?? ARTICLE_TYPES) {
    const bundle = buildBundle(type, options.dataDir, target.season, target.week);
    const path = articlePath(options.contentDir, bundle);
    const hash = bundleHash(bundle);
    if (!options.force && existsSync(path) && storedHash(readFileSync(path, "utf8")) === hash) {
      log.info(`${type}: data unchanged since the last article, skipped`);
      result.skipped.push(path);
      continue;
    }

    const { draft, report, cost } = await writeOne(bundle, options);
    result.costUsd += cost;
    if (report.violations.length > 0) {
      log.warn(`${type}: not written; ${report.violations.length} violations remain`);
      for (const v of report.violations) log.warn(`  - ${v}`);
      result.failed.push({ type, violations: report.violations });
      continue;
    }

    const frontmatter = ArticleFrontmatter.parse({
      title: draft.title.trim(),
      description: draft.description.trim(),
      type,
      season: bundle.season,
      week: bundle.week,
      gameId: bundle.gameId,
      publishedAt: (options.now ?? new Date()).toISOString(),
      model: options.model,
      effort: options.effort,
      dataHash: hash,
      grounding: {
        numbers: report.counts.numbers,
        names: report.counts.names,
        plays: report.counts.plays,
        passed: true,
      },
    });
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, renderArticle(frontmatter, linkPlays(draft.body, bundle)));
    log.info(`${type}: wrote ${path} (${report.counts.words} words)`);
    result.written.push(path);
  }
  return result;
}
