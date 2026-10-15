import type { ArticleType } from "@huddle/shared";

import type { Bundle } from "./bundle.js";

/** What the model must return, as JSON Schema for the CLI's structured output. */
export const ARTICLE_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "Headline, at most 90 characters, no clickbait." },
    description: { type: "string", description: "One-sentence summary, 80 to 160 characters." },
    body: {
      type: "string",
      description:
        "Markdown body: 2 to 4 sections with '## ' sentence-case headings, 500 to 850 words.",
    },
  },
  required: ["title", "description", "body"],
  additionalProperties: false,
} as const;

const RULES = `Rules you must follow:
- Attach a number or rank to a team or player only where DATA attaches it to that team or player. Never borrow one team's figure to describe another; if DATA has no figure for something, do not describe it with a number.
- Use only facts in DATA. Every number you write must appear in DATA. You may round, and you may write a rate like 0.508 as 50.8%. Spell out counts that DATA does not state only if they are plainly countable from DATA.
- Name people only as they appear in DATA. Use full names from "people" as written. For anyone else, use the last name exactly as it appears in a play description (for example "Smith" from "7-G.Smith"). Never add first names from memory.
- Do not use outside knowledge: no other games, seasons, contracts, quotes, rumours or injury details beyond DATA.
- After any sentence about a specific touchdown, interception, fumble or safety, add the tag [p:ID] using that play's id from "plays". Never invent ids.
- No betting advice. A point spread or total may be mentioned only as context.
- No team slogans or nicknames for people. Refer to the head coach by name only if DATA has it.
- Headings are sentence case. Do not add a top-level heading; the page shows the title.
- Plain, confident analysis in the voice of a sharp beat writer: specific, no filler, no hype, no clichés like "in the trenches" or "a tale of two halves".`;

const BRIEF: Record<ArticleType, string> = {
  recap:
    "Write the game recap for the configured team: how the game was won or lost, the turning points (use the key plays and their win-probability swings), how the offense and defense performed against the other side's numbers, and which players graded best and worst by Huddle Grade (0 to 100, league-relative).",
  division:
    "Write the division roundup: where each club stands, what the standings and tiebreakers say, how the simulated division and playoff odds look, which clubs' efficiency backs up or undercuts their record, and the games to watch this week.",
  preview:
    "Write the next-game preview for the configured team: kickoff and setting, how the two teams compare on offense and defense by league rank, the key matchups and which side holds each edge, the injury report, and the recent history between the clubs.",
};

export function analystSystem(type: ArticleType): string {
  return `You write articles for an independent fan analytics site, drafted only from the structured data you are given.

${BRIEF[type]}

${RULES}

Return the title, description and body in the requested JSON shape.`;
}

export function editorSystem(type: ArticleType): string {
  return `You are the editor of an independent fan analytics site. You receive DATA, a DRAFT article and a list of VIOLATIONS found by an automatic fact checker.

The article's purpose: ${BRIEF[type]}

Fix every violation by correcting the claim from DATA or removing it. Then tighten the prose: cut filler and repetition, keep it specific. Do not add any fact, number or name that is not in DATA. Keep valid [p:ID] tags.

${RULES}

Return the full corrected article in the requested JSON shape.`;
}

const dataBlock = (bundle: Bundle) =>
  JSON.stringify({ facts: bundle.facts, plays: bundle.plays, people: bundle.people }, null, 1);

export function analystPrompt(bundle: Bundle): string {
  return `DATA:\n${dataBlock(bundle)}`;
}

export function editorPrompt(
  bundle: Bundle,
  draft: { title: string; description: string; body: string },
  violations: readonly string[],
): string {
  const list = violations.length > 0 ? violations.map((v) => `- ${v}`).join("\n") : "- none";
  return `DATA:\n${dataBlock(bundle)}\n\nDRAFT:\n${JSON.stringify(draft, null, 1)}\n\nVIOLATIONS:\n${list}`;
}
