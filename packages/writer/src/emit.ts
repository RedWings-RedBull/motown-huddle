import type { ArticleFrontmatter } from "@huddle/shared";

import type { Bundle } from "./bundle.js";

/** Replaces [p:ID] tags with a link to the play on the game page, labelled by quarter and clock. */
export function linkPlays(body: string, bundle: Bundle): string {
  const byId = new Map(bundle.plays.map((p) => [p.id, p]));
  return body.replace(/\s?\[p:(\d+)\]/g, (_tag, id: string) => {
    const play = byId.get(Number(id));
    if (!play || bundle.gamePath === null) return "";
    const clock = play.clock.replace(/^0(\d:)/, "$1");
    return ` ([Q${String(play.qtr)} ${clock}](${bundle.gamePath}#play-${id}))`;
  });
}

const yamlString = (s: string) => JSON.stringify(s);

/** A markdown file with YAML frontmatter that the site's content collection validates. */
export function renderArticle(frontmatter: ArticleFrontmatter, body: string): string {
  const f = frontmatter;
  const lines = [
    "---",
    `title: ${yamlString(f.title)}`,
    `description: ${yamlString(f.description)}`,
    `type: ${f.type}`,
    `season: ${String(f.season)}`,
    `week: ${String(f.week)}`,
    `gameId: ${f.gameId === null ? "null" : yamlString(f.gameId)}`,
    `publishedAt: ${yamlString(f.publishedAt)}`,
    `model: ${yamlString(f.model)}`,
    `effort: ${yamlString(f.effort)}`,
    `dataHash: ${yamlString(f.dataHash)}`,
    "grounding:",
    `  numbers: ${String(f.grounding.numbers)}`,
    `  names: ${String(f.grounding.names)}`,
    `  plays: ${String(f.grounding.plays)}`,
    "  passed: true",
    "---",
    "",
  ];
  return `${lines.join("\n")}${body.trim()}\n`;
}

/** The dataHash stored in an existing article, if any. */
export function storedHash(markdown: string): string | null {
  return /^dataHash: "([0-9a-f]{16})"$/m.exec(markdown)?.[1] ?? null;
}
