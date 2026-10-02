import { z } from "zod";

import { WeekId } from "./common.js";

/** A YouTube video played in place from a key play (loaded only when the reader presses play). */
export const HighlightVideo = z
  .object({
    videoId: z.string().regex(/^[\w-]{11}$/),
    url: z.url(),
    title: z.string().min(1),
    channel: z.string().min(1),
    /** "clip": one play (Shorts included); "segment": a stretch of the game; "game": full highlights. */
    kind: z.enum(["clip", "segment", "game"]),
    publishedAt: z.iso.datetime({ offset: true }).nullable(),
    /**
     * Whether YouTube lets the video play inside another site. The league blocks its own and the
     * clubs' uploads; broadcaster uploads usually play. Blocked videos open on YouTube instead.
     */
    embeddable: z.boolean(),
    /** API-sourced entries are rewritten on every run; manual ones are kept as they are. */
    source: z.enum(["youtube-api", "manual"]),
  })
  .strict();
export type HighlightVideo = z.infer<typeof HighlightVideo>;

/** A scored alternative kept for review; the best one becomes the play's video. */
export const HighlightCandidate = z
  .object({
    videoId: z.string().regex(/^[\w-]{11}$/),
    title: z.string().min(1),
    channel: z.string().min(1),
    publishedAt: z.iso.datetime({ offset: true }).nullable(),
    score: z.number(),
  })
  .strict();
export type HighlightCandidate = z.infer<typeof HighlightCandidate>;

export const Highlights = WeekId.extend({
  /** The official game-highlights video, when one was found. */
  game: HighlightVideo.nullable(),
  /** Key-play id -> the chosen video. Plays without one fall back to `game`. */
  plays: z.record(z.string().regex(/^\d+$/), HighlightVideo),
  /** Key-play id -> up to three scored candidates from the search, best first. */
  candidates: z.record(z.string().regex(/^\d+$/), z.array(HighlightCandidate).max(3)),
  /** YouTube search for this game, the last-resort link. */
  searchUrl: z.url(),
}).strict();
export type Highlights = z.infer<typeof Highlights>;
