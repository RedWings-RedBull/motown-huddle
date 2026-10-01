import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  DepthChartRow,
  FtnRow,
  GamesRow,
  NgsPassingRow,
  PbpRow,
  PfrDefRow,
  PlayersRow,
  SnapCountRow,
  StatsPlayerRow,
  bool,
  forSeason,
  forWeek,
  na,
  str,
} from "../src/columns.js";
import { columnsOf, parseCsvText, readCsv } from "../src/csv.js";
import { ValidationError } from "../src/errors.js";
import { GAME_ID, fixture } from "./helpers.js";

describe("na / bool / str helpers", () => {
  it("maps NA and empty strings to null and coerces numbers", () => {
    const schema = z.object({ v: na() });
    expect(schema.parse({ v: "NA" }).v).toBeNull();
    expect(schema.parse({ v: "" }).v).toBeNull();
    expect(schema.parse({}).v).toBeNull();
    expect(schema.parse({ v: "0.433207958936691" }).v).toBeCloseTo(0.4332, 4);
    expect(schema.parse({ v: "-3" }).v).toBe(-3);
    expect(schema.safeParse({ v: "abc" }).success).toBe(false);
  });

  it("parses R-style booleans", () => {
    const schema = z.object({ v: bool() });
    expect(schema.parse({ v: "TRUE" }).v).toBe(true);
    expect(schema.parse({ v: "FALSE" }).v).toBe(false);
    expect(schema.parse({ v: "1" }).v).toBe(true);
    expect(schema.parse({ v: "0" }).v).toBe(false);
    expect(schema.parse({ v: "NA" }).v).toBeNull();
    expect(schema.parse({}).v).toBeNull();
    expect(schema.safeParse({ v: "maybe" }).success).toBe(false);
  });

  it("keeps text but nulls NA", () => {
    const schema = z.object({ v: str() });
    expect(schema.parse({ v: "left" }).v).toBe("left");
    expect(schema.parse({ v: "NA" }).v).toBeNull();
  });
});

describe("readCsv on fixture slices", () => {
  it("streams a gzipped play-by-play slice and drops other weeks in-stream", async () => {
    const rows = await readCsv(fixture("play_by_play.csv.gz"), {
      schema: PbpRow,
      keep: forWeek(2026, 3),
    });
    expect(rows.length).toBe(685);
    const game = rows.filter((r) => r.game_id === GAME_ID);
    expect(game.length).toBe(167);
    const first = game[0];
    expect(first?.posteam).toBeNull();
    expect(first?.down).toBeNull();
    expect(first?.yardline_100).toBeNull();
    const kickoff = game[1];
    expect(kickoff?.play_type).toBe("kickoff");
    expect(kickoff?.wp).toBeCloseTo(0.4332, 3);
    const none = await readCsv(fixture("play_by_play.csv.gz"), {
      schema: PbpRow,
      keep: forWeek(2026, 4),
    });
    expect(none).toEqual([]);
  });

  it("parses every other file with its schema", async () => {
    const stats = await readCsv(fixture("stats_player_week.csv"), { schema: StatsPlayerRow });
    expect(stats.length).toBe(287);
    const goff = stats.find((s) => s.player_id === "00-0033106");
    expect(goff?.attempts).toBe(32);
    expect(goff?.passing_cpoe).not.toBeNull();
    const snaps = await readCsv(fixture("snap_counts.csv"), { schema: SnapCountRow });
    expect(snaps.length).toBe(368);
    const ftn = await readCsv(fixture("ftn_charting.csv"), { schema: FtnRow });
    expect(ftn.some((r) => r.is_drop === true)).toBe(true);
    const def = await readCsv(fixture("advstats_week_def.csv"), { schema: PfrDefRow });
    expect(def.length).toBe(50);
    const charts = await readCsv(fixture("depth_charts.csv"), { schema: DepthChartRow });
    expect(charts.some((r) => r.gsis_id === null)).toBe(true);
    const players = await readCsv(fixture("players.csv"), { schema: PlayersRow });
    expect(players.find((p) => p.gsis_id === "00-0033106")?.pfr_id).toBe("GoffJa00");
    const ngs = await readCsv(fixture("ngs_passing.csv.gz"), {
      schema: NgsPassingRow,
      keep: forWeek(2026, 3),
    });
    expect(ngs.length).toBe(8);
    const games = await readCsv(fixture("games.csv"), {
      schema: GamesRow,
      keep: forSeason(2026),
    });
    expect(games.find((g) => g.game_id === GAME_ID)?.total_line).toBe(49.5);
    expect(games.find((g) => g.week === 4 && g.home_team === "CAR")?.total).toBeNull();
  });

  it("fails loudly when a required column is missing", async () => {
    await expect(
      parseCsvText("game_id,season\n2026_03_NYJ_DET,2026\n", { schema: SnapCountRow }),
    ).rejects.toThrow(ValidationError);
    await expect(
      parseCsvText("game_id,season\n2026_03_NYJ_DET,2026\n", { schema: SnapCountRow }),
    ).rejects.toThrow(/missing columns week, player/);
  });

  it("reports the row and column of a bad value", async () => {
    const text =
      "play_id,game_id,season,week,home_team,away_team\n1,g,2026,3,DET,NYJ\nx,g,2026,3,DET,NYJ\n";
    const schema = z.object({ play_id: na(), game_id: z.string() });
    await expect(parseCsvText(text, { schema })).rejects.toThrow(/row 2: play_id/);
  });

  it("honours a row limit", async () => {
    const rows = await readCsv(fixture("snap_counts.csv"), { schema: SnapCountRow, limit: 5 });
    expect(rows.length).toBe(5);
  });

  it("lists the columns of an object schema", () => {
    expect(columnsOf(SnapCountRow)).toContain("pfr_player_id");
    expect(columnsOf(z.string())).toEqual([]);
  });
});
