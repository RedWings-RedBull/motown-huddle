import { z } from "zod";

import { WeekId } from "./common.js";

/** The league's official game-highlights video for one game. Linked, never embedded. */
export const HighlightVideo = z
  .object({
    videoId: z.string().regex(/^[\w-]{11}$/),
    url: z.url(),
    title: z.string().min(1),
    channel: z.string().min(1),
    publishedAt: z.iso.datetime({ offset: true }).nullable(),
    /** API-sourced entries are refreshed on every run; manual ones are kept as they are. */
    source: z.enum(["youtube-api", "manual"]),
  })
  .strict();
export type HighlightVideo = z.infer<typeof HighlightVideo>;

export const GameHighlights = WeekId.extend({
  /** Null until the league has posted the video; the page then shows `searchUrl`. */
  video: HighlightVideo.nullable(),
  /** A YouTube search for this game's highlights, always valid. */
  searchUrl: z.url(),
}).strict();
export type GameHighlights = z.infer<typeof GameHighlights>;
