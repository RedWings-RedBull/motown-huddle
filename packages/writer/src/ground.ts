/**
 * Deterministic grounding check. An article passes only when every number it states can be traced
 * to the bundle, every multi-word proper name appears in the bundle (or is a club, place or league
 * term), every play tag points at a real play, and every sentence that claims a scoring play or a
 * turnover carries a play tag. No model is involved here.
 */
import { DIVISIONS, TEAM_NAMES } from "@huddle/shared";

import type { Bundle } from "./bundle.js";

export interface GroundingReport {
  violations: string[];
  counts: { numbers: number; names: number; plays: number; words: number };
}

const MIN_WORDS = 350;
const MAX_WORDS = 1100;

/** Every string and number leaf of a value. */
function leaves(value: unknown, strings: string[], numbers: number[]): void {
  if (typeof value === "number") numbers.push(value);
  else if (typeof value === "string") strings.push(value);
  else if (Array.isArray(value)) for (const v of value) leaves(v, strings, numbers);
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      strings.push(k);
      leaves(v, strings, numbers);
    }
  }
}

const NUMBER_IN_TEXT = /\d+(?:\.\d+)?/g;

/** Numbers the article may use: every numeric leaf, numbers inside strings, and their % forms. */
export function allowedNumbers(bundle: Bundle): number[] {
  const strings: string[] = [];
  const numbers: number[] = [bundle.season, bundle.week];
  leaves(bundle.facts, strings, numbers);
  leaves(bundle.plays, strings, numbers);
  for (const s of strings) for (const m of s.matchAll(NUMBER_IN_TEXT)) numbers.push(Number(m[0]));
  const out = new Set<number>();
  for (const n of numbers) {
    const a = Math.abs(n);
    out.add(a);
    if (a > 0 && a <= 1) out.add(Math.round(a * 1000) / 10);
  }
  return [...out];
}

/** Tokens like 31, -24, 50.8%, +0.13, 1,234, 3rd. */
const NUMBER_TOKEN = /(?<![\w.])[-+]?\d{1,3}(?:,\d{3})+(?:\.\d+)?|(?<![\w.])[-+]?\d+(?:\.\d+)?/g;

function numberIsGrounded(value: number, allowed: readonly number[]): boolean {
  if (Number.isInteger(value) && value >= 0 && value <= 4) return true; // downs, quarters
  return allowed.some((a) => Math.abs(value - a) <= Math.max(0.051, 0.006 * a));
}

/** Club names, nicknames, cities and league terms are always fine to name. */
function fixedNames(): string[] {
  const names = new Set<string>(["nfc north", "nfc", "afc", "nfl", "huddle grade", "super bowl"]);
  for (const full of Object.values(TEAM_NAMES)) {
    names.add(full.toLowerCase());
    const parts = full.split(" ");
    names.add((parts.at(-1) ?? "").toLowerCase());
    names.add(parts.slice(0, -1).join(" ").toLowerCase());
  }
  for (const d of Object.keys(DIVISIONS)) names.add(d.toLowerCase());
  return [...names];
}

/** Searchable text of everything the bundle names, with "G.Smith" also as "g. smith" and "smith". */
function nameCorpus(bundle: Bundle): string {
  const strings: string[] = [...bundle.people];
  leaves(bundle.facts, strings, []);
  for (const p of bundle.plays) strings.push(p.desc);
  const extra: string[] = [];
  for (const s of strings) {
    for (const m of s.matchAll(/\b([A-Z])\.((?:St\. )?[A-Z][A-Za-z'’-]+)/g)) {
      extra.push(`${m[1] ?? ""}. ${m[2] ?? ""}`, m[2] ?? "");
    }
  }
  return ` ${[...strings, ...extra, ...fixedNames()].join(" | ").toLowerCase()} `;
}

const LEADING_STOP = new Set(
  "the a an in on at after before with but and then when while for from that this these those his their its as by of to into over under during against".split(
    " ",
  ),
);

/**
 * A capitalised word. A period belongs to a word only in initials and short abbreviations
 * ("D.J.", "St."), so a sentence-ending period ends the phrase.
 */
const WORD = String.raw`(?:[A-Z][a-z]?\.(?:[A-Z][a-z]?\.)*|[A-Z][A-Za-z'’-]*)`;
/** Words joined by spaces or tabs only (never a line break), with an optional "of" between. */
const PHRASE = new RegExp(String.raw`\b${WORD}(?:[ \t]+(?:of[ \t]+)?${WORD})+`, "g");

/** Multi-word capitalised phrases in prose, minus a leading function word. */
export function properPhrases(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(PHRASE)) {
    let words = m[0].replace(/['’]s\b/g, "").split(/\s+/);
    while (words.length > 0 && LEADING_STOP.has((words[0] ?? "").toLowerCase()))
      words = words.slice(1);
    if (words.length >= 2) out.push(words.join(" ").replace(/\.$/, ""));
  }
  return out;
}

const PLAY_TAG = /\[p:(\d+)\]/g;
/** Scoring and turnover claims. "Safety" counts only as the score, never as the position. */
const PLAY_CLAIM =
  /\b(touchdown|touchdowns|intercepted|interception|picked off|fumble|fumbled|strip-sack|(?:for|recorded|conceded|took) a safety)\b/i;

/** Splits markdown prose into sentences, skipping headings. */
function sentences(markdown: string): string[] {
  return markdown
    .split("\n")
    .filter((l) => !/^\s*#/.test(l))
    .join(" ")
    .split(/(?<=[.!?])\s+(?=[A-Z"“(])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function checkArticle(
  article: { title: string; description: string; body: string },
  bundle: Bundle,
): GroundingReport {
  const violations: string[] = [];
  const prose = `${article.title}\n${article.description}\n${article.body}`;
  const withoutTags = prose.replace(PLAY_TAG, "");

  const allowed = allowedNumbers(bundle);
  let numbers = 0;
  for (const m of withoutTags.matchAll(NUMBER_TOKEN)) {
    const value = Math.abs(Number(m[0].replace(/,/g, "")));
    numbers += 1;
    if (!numberIsGrounded(value, allowed)) violations.push(`number not in the data: "${m[0]}"`);
  }

  const corpus = nameCorpus(bundle);
  let names = 0;
  const bodyWithoutHeadings = withoutTags
    .split("\n")
    .filter((l) => !/^\s*#/.test(l))
    .join("\n");
  for (const phrase of new Set(properPhrases(bodyWithoutHeadings))) {
    names += 1;
    if (!corpus.includes(phrase.toLowerCase())) {
      violations.push(`name or term not in the data: "${phrase}"`);
    }
  }

  const playIds = new Set(bundle.plays.map((p) => p.id));
  let plays = 0;
  for (const m of prose.matchAll(PLAY_TAG)) {
    plays += 1;
    if (!playIds.has(Number(m[1]))) violations.push(`play tag points at no play: "${m[0]}"`);
  }
  if (bundle.plays.length > 0) {
    for (const s of sentences(article.body)) {
      if (PLAY_CLAIM.test(s) && !/\[p:\d+\]/.test(s)) {
        violations.push(`play claim without a play tag: "${s.slice(0, 120)}"`);
      }
    }
  }

  const words = article.body.replace(PLAY_TAG, "").split(/\s+/).filter(Boolean).length;
  if (words < MIN_WORDS)
    violations.push(`too short: ${String(words)} words (minimum ${String(MIN_WORDS)})`);
  if (words > MAX_WORDS)
    violations.push(`too long: ${String(words)} words (maximum ${String(MAX_WORDS)})`);

  return { violations, counts: { numbers, names, plays, words } };
}
