/**
 * Pure matching of key plays to YouTube videos. Official channels title single-play clips after the
 * players involved ("Garrett Wilson Fourth-Down TD!"), so a play's participants, drawn from its
 * play-by-play description, are the strongest signal; keywords, yardage and the clip's publish time
 * relative to the game clock refine it.
 */
import type { HighlightCandidate, HighlightVideo, KeyPlay } from "@huddle/shared";
import { teamName } from "@huddle/shared";

export interface VideoCandidate {
  videoId: string;
  title: string;
  channel: string;
  publishedAt: string | null;
}

/** Last names from "16-K.Sadiq", "14-A.St. Brown", "7-G.Smith Jr." style tokens, in order. */
export function playerNames(desc: string): string[] {
  const re = /\d{1,2}-[A-Z]\.((?:St\. )?[A-Z][A-Za-z'’-]+(?: (?:Jr|Sr|II|III|IV)\.?)?)/g;
  const names: string[] = [];
  for (const m of desc.matchAll(re)) {
    const name = (m[1] ?? "").replace(/\s+(Jr|Sr|II|III|IV)\.?$/, "");
    if (!names.includes(name)) names.push(name);
  }
  return names;
}

const isPassPlay = (desc: string): boolean => /\bpass\b/i.test(desc) && !/\bsacked\b/i.test(desc);

/** Players worth searching for: on a pass the receiver and defenders, not the passer. */
export function focusNames(play: KeyPlay): string[] {
  const names = playerNames(play.desc);
  if (names.length > 1 && isPassPlay(play.desc)) return names.slice(1);
  return names;
}

const nickname = (code: string): string => teamName(code).split(" ").at(-1) ?? code;

/** What happened, in the words a video title would use. */
function actionWords(play: KeyPlay): string[] {
  const tags = new Set(play.tags);
  const words: string[] = [];
  if (tags.has("td")) words.push("touchdown");
  if (tags.has("sack")) words.push("sack");
  if (tags.has("turnover")) {
    words.push(/\bintercept/i.test(play.desc) ? "interception" : "fumble");
  }
  if (tags.has("fourth-down")) words.push("fourth down");
  if (tags.has("fg")) words.push("field goal");
  if (words.length === 0) words.push(isPassPlay(play.desc) ? "catch" : "run");
  return words;
}

/**
 * Several ways to ask YouTube for the same play. Titles vary ("Sadiq! Geno slings rookie TE...",
 * "Garrett Wilson Fourth-Down TD!"), so the union of a few phrasings finds more than any one.
 */
export function queryPhrasings(play: KeyPlay, home: string, away: string): string[] {
  const names = focusNames(play);
  if (names.length === 0) return [];
  const primary = names[0] ?? "";
  const out = new Set<string>();
  out.add(names.join(" | "));
  out.add(`${primary} ${actionWords(play)[0] ?? ""}`.trim());
  out.add(`${primary} ${nickname(home)} ${nickname(away)}`);
  if (names.length > 1) out.add(names.slice(0, 2).join(" "));
  return [...out];
}

/** Channels whose uploads are the rights holder's own: the league, the two clubs, its broadcasters. */
function officialChannels(home: string, away: string): Set<string> {
  return new Set(
    [
      "NFL",
      "NFL Network",
      "NFL Films",
      "NFL on FOX",
      "NFL on CBS",
      "NFL on NBC",
      "NFL on ESPN",
      "NFL on Prime Video",
      teamName(home),
      teamName(away),
    ].map((c) => c.toLowerCase()),
  );
}

export function isOfficial(video: VideoCandidate, home: string, away: string): boolean {
  return officialChannels(home, away).has(video.channel.trim().toLowerCase());
}

const normalise = (s: string): string => s.toLowerCase().replace(/[.’']/g, "").replace(/\s+/g, " ");

const COMPILATION =
  /\b(every|best plays?|game highlights|top \d+|top plays|all \d+|full highlights|mic'?d up|press conference|postgame|preview|recap)\b/i;

/** True for videos that cover more than one play; never linked from a single play. */
export function isCompilation(title: string): boolean {
  return COMPILATION.test(title);
}

/** Is this the official game-highlights package for the two clubs? */
export function isGameHighlights(title: string, home: string, away: string): boolean {
  const t = title.toLowerCase();
  return (
    t.includes("game highlights") &&
    t.includes(nickname(home).toLowerCase()) &&
    t.includes(nickname(away).toLowerCase())
  );
}

/** Seconds of game time elapsed before the play (overtime is a ten-minute period). */
export function elapsedGameSeconds(play: KeyPlay): number {
  const [mm, ss] = play.clock.split(":").map(Number);
  const left = (mm ?? 0) * 60 + (ss ?? 0);
  if (play.qtr >= 5) return 3600 + (600 - Math.min(left, 600));
  return (play.qtr - 1) * 900 + (900 - Math.min(left, 900));
}

/** Real seconds per game second over a whole broadcast game (about 3h10 for 60:00). */
const REAL_PER_GAME_SECOND = 3.1;
const HALFTIME_SECONDS = 15 * 60;

/** When the league would have posted a clip of this play: kickoff plus elapsed real time. */
export function expectedPublishMs(play: KeyPlay, kickoffMs: number): number {
  const halftime = play.qtr >= 3 ? HALFTIME_SECONDS : 0;
  return kickoffMs + (elapsedGameSeconds(play) * REAL_PER_GAME_SECOND + halftime) * 1000;
}

/** +1 when the clip went up close to when the play happened, -2 when it clearly did not. */
export function timingScore(play: KeyPlay, video: VideoCandidate, kickoffMs: number): number {
  if (video.publishedAt === null) return 0;
  const published = Date.parse(video.publishedAt);
  if (Number.isNaN(published)) return 0;
  const minutes = Math.abs(published - expectedPublishMs(play, kickoffMs)) / 60_000;
  if (minutes <= 25) return 1;
  if (minutes <= 60) return 0;
  return -2;
}

/** Higher is better; below 2 the video is not about this play. */
export function scoreClip(play: KeyPlay, video: VideoCandidate, kickoffMs?: number): number {
  if (isCompilation(video.title)) return -10;
  const title = normalise(video.title);
  let score = 0;
  for (const name of focusNames(play)) {
    if (title.includes(normalise(name))) score += 2;
  }
  if (score === 0) return 0;
  const tags = new Set(play.tags);
  if (tags.has("td") && /\b(td|touchdown)\b/.test(title)) score += 1;
  if (tags.has("sack") && /\bsack/.test(title)) score += 1;
  if (
    tags.has("turnover") &&
    /\b(fumble|strip|interception|int|picks? off|turnover)\b/.test(title)
  ) {
    score += 1;
  }
  if (tags.has("fourth-down") && /\b(fourth|4th)[ -]down\b/.test(title)) score += 1;
  if (tags.has("fg") && /\bfield goal\b/.test(title)) score += 1;
  const yards = /for (\d+) yards/.exec(play.desc)?.[1];
  if (yards && new RegExp(`\\b${yards}[ -]y(ar)?d`).test(title)) score += 1;
  const isPass = isPassPlay(play.desc);
  const isRun = /\b(right|left|middle|end|tackle|guard)\b/i.test(play.desc) && !isPass;
  if (isPass && /\b(run|rush)\b/.test(title) && !/\b(catch|pass|throw|reception)\b/.test(title)) {
    score -= 1;
  }
  if (isRun && /\b(catch|pass|throw|reception)\b/.test(title)) score -= 1;
  if (kickoffMs !== undefined) score += timingScore(play, video, kickoffMs);
  return score;
}

/** The best-scoring videos for one play, best first; only real matches (score 2 or more). */
export function topCandidates(
  play: KeyPlay,
  videos: readonly VideoCandidate[],
  kickoffMs?: number,
  limit = 3,
): HighlightCandidate[] {
  return videos
    .map((v) => ({ v, score: scoreClip(play, v, kickoffMs) }))
    .filter(({ score }) => score >= 2)
    .sort(
      (a, b) =>
        b.score - a.score ||
        (a.v.publishedAt ?? "").localeCompare(b.v.publishedAt ?? "") ||
        a.v.videoId.localeCompare(b.v.videoId),
    )
    .slice(0, limit)
    .map(({ v, score }) => ({
      videoId: v.videoId,
      title: v.title,
      channel: v.channel,
      publishedAt: v.publishedAt,
      score,
    }));
}

export interface Match {
  playId: number;
  video: VideoCandidate;
  score: number;
}

/**
 * Minimum-cost assignment (Hungarian method, O(n^3)) of plays to videos. Rows are plays, columns
 * videos; `cost[i][j]` is the negated score, or 0 when the pair is not a match. Returns the column
 * chosen for each row, or -1.
 */
function assign(cost: number[][]): number[] {
  const n = cost.length;
  const m = Math.max(n, cost[0]?.length ?? 0);
  if (n === 0) return [];
  const at = (i: number, j: number): number => cost[i]?.[j] ?? 0;
  const u = new Array<number>(n + 1).fill(0);
  const v = new Array<number>(m + 1).fill(0);
  const p = new Array<number>(m + 1).fill(0);
  const way = new Array<number>(m + 1).fill(0);
  for (let i = 1; i <= n; i += 1) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array<number>(m + 1).fill(Number.POSITIVE_INFINITY);
    const used = new Array<boolean>(m + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0] ?? 0;
      let delta = Number.POSITIVE_INFINITY;
      let j1 = 0;
      for (let j = 1; j <= m; j += 1) {
        if (used[j]) continue;
        const cur = at(i0 - 1, j - 1) - (u[i0] ?? 0) - (v[j] ?? 0);
        if (cur < (minv[j] ?? 0)) {
          minv[j] = cur;
          way[j] = j0;
        }
        if ((minv[j] ?? 0) < delta) {
          delta = minv[j] ?? 0;
          j1 = j;
        }
      }
      for (let j = 0; j <= m; j += 1) {
        if (used[j]) {
          u[p[j] ?? 0] = (u[p[j] ?? 0] ?? 0) + delta;
          v[j] = (v[j] ?? 0) - delta;
        } else {
          minv[j] = (minv[j] ?? 0) - delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0] ?? 0;
      p[j0] = p[j1] ?? 0;
      j0 = j1;
    } while (j0 !== 0);
  }
  const out = new Array<number>(n).fill(-1);
  for (let j = 1; j <= m; j += 1) {
    const row = p[j] ?? 0;
    if (row !== 0) out[row - 1] = j - 1;
  }
  return out;
}

/**
 * One-to-one play/video assignment that maximises the total score, deterministic in input order.
 * A clip whose best score is shared by two plays is not assigned at all.
 */
export function matchClips(
  plays: readonly KeyPlay[],
  videos: readonly VideoCandidate[],
  kickoffMs?: number,
): Match[] {
  const rows = [...plays].sort((a, b) => a.playId - b.playId);
  const cols = [...videos].sort(
    (a, b) =>
      (a.publishedAt ?? "").localeCompare(b.publishedAt ?? "") ||
      a.videoId.localeCompare(b.videoId),
  );
  const scores = rows.map((play) => cols.map((video) => scoreClip(play, video, kickoffMs)));
  const cost = scores.map((r) => r.map((v) => (v >= 2 ? -v : 0)));
  const chosen = assign(cost);
  const eligible = (i: number, j: number): number =>
    (cost[i]?.[j] ?? 0) < 0 ? (scores[i]?.[j] ?? 0) : 0;
  const total = chosen.reduce((sum, j, i) => sum + (j >= 0 ? eligible(i, j) : 0), 0);
  // A pair is ambiguous when handing its video to another play that scores the same leaves the
  // total unchanged: two optimal assignments exist, so the clip stays off both plays.
  const ambiguous = (i: number, j: number): boolean => {
    const own = eligible(i, j);
    return rows.some((_, k) => {
      if (k === i || eligible(k, j) !== own) return false;
      const jk = chosen[k] ?? -1;
      const kOwn = jk >= 0 ? eligible(k, jk) : 0;
      const iAlt = jk >= 0 ? eligible(i, jk) : 0;
      return total - own - kOwn + eligible(k, j) + iAlt >= total;
    });
  };
  const out: Match[] = [];
  rows.forEach((play, i) => {
    const j = chosen[i] ?? -1;
    const video = cols[j];
    if (j < 0 || !video || eligible(i, j) === 0 || ambiguous(i, j)) return;
    out.push({ playId: play.playId, video, score: eligible(i, j) });
  });
  return out;
}

export function toVideo(
  v: VideoCandidate,
  kind: HighlightVideo["kind"],
  embeddable = false,
): HighlightVideo {
  return {
    videoId: v.videoId,
    url: `https://www.youtube.com/watch?v=${v.videoId}`,
    title: v.title,
    channel: v.channel,
    kind,
    publishedAt: v.publishedAt,
    embeddable,
    source: "youtube-api",
  };
}

/** The last-resort link: a YouTube search for the game, no API involved. */
export function searchUrl(season: number, week: number, home: string, away: string): string {
  const q = `${teamName(away)} vs. ${teamName(home)} ${season} week ${week} highlights`;
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
}
