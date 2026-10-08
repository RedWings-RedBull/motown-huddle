/**
 * Strict recognition of the league's official game-highlights video. The league titles every one
 * "<Club> vs[.] <Club> Game Highlights | <season label> Week <n>" with small variations (period
 * after "vs" or not, "NFL 2026 Season" or "2026 NFL Season", either club first, an occasional
 * suffix such as "from Rio"). The parts that never vary are what the rule checks.
 */
import { teamName } from "@huddle/shared";

export interface VideoCandidate {
  videoId: string;
  title: string;
  channelId: string;
  channel: string;
  publishedAt: string | null;
}

/** The league's own YouTube channel. Only its uploads are accepted. */
export const NFL_CHANNEL_ID = "UCDVYQ4Zhbm3S2dlz7P1GBDg";

const words = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * True only for the official package of this game: league channel, both clubs' full names, the
 * words "game highlights", the right week number, and no preview/recap wording.
 */
export function isGameHighlights(
  video: VideoCandidate,
  home: string,
  away: string,
  week: number,
): boolean {
  if (video.channelId !== NFL_CHANNEL_ID) return false;
  const t = ` ${words(video.title)} `;
  if (!t.includes(" game highlights ")) return false;
  if (!t.includes(` ${words(teamName(home))} `) || !t.includes(` ${words(teamName(away))} `)) {
    return false;
  }
  if (!t.includes(` week ${week} `)) return false;
  return !/ (preview|recap|reaction|condensed|mic d up) /.test(t);
}

/** The earliest upload that passes the rule, or null. Earliest wins so reruns are stable. */
export function pickGameHighlights(
  videos: readonly VideoCandidate[],
  home: string,
  away: string,
  week: number,
): VideoCandidate | null {
  const matches = videos
    .filter((v) => isGameHighlights(v, home, away, week))
    .sort(
      (a, b) =>
        (a.publishedAt ?? "").localeCompare(b.publishedAt ?? "") ||
        a.videoId.localeCompare(b.videoId),
    );
  return matches[0] ?? null;
}

/** What the search asks for. The rule above, not the query, decides what is accepted. */
export function searchQuery(home: string, away: string): string {
  return `${teamName(away)} vs. ${teamName(home)} Game Highlights`;
}

/** The always-valid fallback link: a YouTube search for this game's highlights. */
export function searchUrl(season: number, week: number, home: string, away: string): string {
  const q = `${teamName(away)} vs. ${teamName(home)} ${season} week ${week} game highlights`;
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
}
