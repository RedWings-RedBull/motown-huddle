import type { KeyPlay } from "@huddle/shared";
import { describe, expect, it } from "vitest";

import {
  elapsedGameSeconds,
  expectedPublishMs,
  matchClips,
  scoreClip,
  timingScore,
  type VideoCandidate,
} from "../src/highlights/match.js";

const KICKOFF = Date.parse("2026-09-27T17:00:00Z");

const gibbs = (playId: number, qtr: number, clock: string): KeyPlay => ({
  playId,
  qtr,
  clock,
  down: 1,
  ydstogo: 10,
  yardline100: 9,
  posteam: "DET",
  desc: "0-J.Gibbs right end for 9 yards, TOUCHDOWN.",
  epa: 3,
  wpa: 0.1,
  tags: ["td"],
});

const vid = (videoId: string, title: string, publishedAt: string | null): VideoCandidate => ({
  videoId,
  title,
  channel: "NFL",
  publishedAt,
});

describe("game clock to real time", () => {
  it("converts quarter and time left into elapsed game seconds", () => {
    expect(elapsedGameSeconds(gibbs(1, 1, "15:00"))).toBe(0);
    expect(elapsedGameSeconds(gibbs(1, 3, "11:06"))).toBe(2034);
    expect(elapsedGameSeconds(gibbs(1, 4, "00:00"))).toBe(3600);
    expect(elapsedGameSeconds(gibbs(1, 5, "4:00"))).toBe(3960);
  });

  it("estimates when the clip would be posted, with halftime after the second quarter", () => {
    const q2 = (expectedPublishMs(gibbs(1, 2, "15:00"), KICKOFF) - KICKOFF) / 60_000;
    const q3 = (expectedPublishMs(gibbs(1, 3, "15:00"), KICKOFF) - KICKOFF) / 60_000;
    expect(q2).toBeCloseTo(46.5, 1);
    expect(q3).toBeCloseTo(108, 1);
  });

  it("scores clips by how close their publish time is to the play", () => {
    const play = gibbs(1, 3, "11:06");
    const expected = expectedPublishMs(play, KICKOFF);
    const at = (offsetMinutes: number) => new Date(expected + offsetMinutes * 60_000).toISOString();
    expect(timingScore(play, vid("a", "t", at(10)), KICKOFF)).toBe(1);
    expect(timingScore(play, vid("b", "t", at(-40)), KICKOFF)).toBe(0);
    expect(timingScore(play, vid("c", "t", at(90)), KICKOFF)).toBe(-2);
    expect(timingScore(play, vid("d", "t", null), KICKOFF)).toBe(0);
    expect(timingScore(play, vid("e", "t", "not a date"), KICKOFF)).toBe(0);
  });
});

describe("same-name plays", () => {
  it("tells five Gibbs touchdowns apart by when their clips went up", () => {
    const plays = [
      gibbs(1, 1, "08:00"),
      gibbs(2, 2, "03:00"),
      gibbs(3, 3, "11:00"),
      gibbs(4, 4, "09:00"),
      gibbs(5, 4, "01:00"),
    ];
    const posted = (p: KeyPlay) =>
      new Date(expectedPublishMs(p, KICKOFF) + 4 * 60_000).toISOString();
    const videos = plays
      .map((p, i) => vid(`gibbs${i}`, `Gibbs scores again, TD number ${i + 1}`, posted(p)))
      .reverse();
    const matches = matchClips(plays, videos, KICKOFF);
    expect(matches.map((m) => [m.playId, m.video.videoId])).toEqual([
      [1, "gibbs0"],
      [2, "gibbs1"],
      [3, "gibbs2"],
      [4, "gibbs3"],
      [5, "gibbs4"],
    ]);
  });

  it("drops a clip from another day even when the name and keyword fit", () => {
    const play = gibbs(1, 1, "08:00");
    expect(
      scoreClip(play, vid("old", "Gibbs TD run", "2026-09-20T18:00:00Z"), KICKOFF),
    ).toBeLessThan(2);
    expect(scoreClip(play, vid("old", "Gibbs TD run", "2026-09-20T18:00:00Z"))).toBe(3);
  });

  it("leaves two plays unmatched rather than guessing when nothing separates them", () => {
    // Two touchdowns twenty game seconds apart: the same clip fits both equally.
    const first = gibbs(1, 4, "01:20");
    const plays = [first, gibbs(2, 4, "01:00")];
    const posted = new Date(expectedPublishMs(first, KICKOFF) + 60_000).toISOString();
    const videos = [vid("one", "Gibbs scores!", posted)];
    expect(matchClips(plays, videos, KICKOFF)).toEqual([]);
  });
});
