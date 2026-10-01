import { describe, expect, it } from "vitest";

import { PlayersRow, SnapCountRow } from "../src/columns.js";
import { buildCrosswalk, checkCrosswalk } from "../src/crosswalk.js";
import { readCsv } from "../src/csv.js";
import { ValidationError } from "../src/errors.js";
import { fixture } from "./helpers.js";

describe("crosswalk", () => {
  it("maps pfr ids to gsis ids and carries identity fields", async () => {
    const players = await readCsv(fixture("players.csv"), { schema: PlayersRow });
    const cw = buildCrosswalk(players);
    expect(cw.gsisForPfr("GoffJa00")).toBe("00-0033106");
    expect(cw.gsisForPfr("Nobody00")).toBeNull();
    const goff = cw.byGsis.get("00-0033106");
    expect(goff?.name).toBe("Jared Goff");
    expect(goff?.jersey).toBe(16);
    expect(goff?.position).toBe("QB");
  });

  it("skips rows without a gsis id and keeps the first pfr mapping", () => {
    const cw = buildCrosswalk([
      row({ gsis_id: null, pfr_id: "X" }),
      row({ gsis_id: "a", pfr_id: "X" }),
      row({ gsis_id: "b", pfr_id: "X" }),
      row({ gsis_id: "c", pfr_id: null, jersey_number: null }),
    ]);
    expect(cw.gsisForPfr("X")).toBe("a");
    expect(cw.byGsis.get("c")?.jersey).toBeNull();
  });

  it("passes the team check when every row matches and reports the unmatched share", async () => {
    const players = await readCsv(fixture("players.csv"), { schema: PlayersRow });
    const snaps = await readCsv(fixture("snap_counts.csv"), { schema: SnapCountRow });
    const cw = buildCrosswalk(players);
    const det = snaps.filter((s) => s.team === "DET");
    const check = checkCrosswalk(cw, det);
    expect(check.total).toBe(45);
    expect(check.unmatched).toEqual([]);
    expect(checkCrosswalk(cw, [])).toEqual({ total: 0, unmatched: [], share: 0 });
  });

  it("fails with exit code 2 semantics when more than 2 % of team rows are unmatched", async () => {
    const players = await readCsv(fixture("players.csv"), { schema: PlayersRow });
    const snaps = await readCsv(fixture("snap_counts.csv"), { schema: SnapCountRow });
    const cw = buildCrosswalk(
      players.filter((p) => p.pfr_id !== "GoffJa00" && p.pfr_id !== "SewePe00"),
    );
    const det = snaps.filter((s) => s.team === "DET");
    expect(() => checkCrosswalk(cw, det)).toThrow(ValidationError);
    expect(() => checkCrosswalk(cw, det)).toThrow(/2 of 45 team rows.*Jared Goff \(GoffJa00\)/);
    // One unmatched row out of 45 is 2.2 %: still over the line.
    const cwOne = buildCrosswalk(players.filter((p) => p.pfr_id !== "GoffJa00"));
    expect(() => checkCrosswalk(cwOne, det)).toThrow(/1 of 45/);
    // One out of 92 (both teams) is within tolerance and only reported.
    const both = snaps.filter((s) => s.game_id === "2026_03_NYJ_DET");
    expect(checkCrosswalk(cwOne, both).unmatched).toEqual(["Jared Goff (GoffJa00)"]);
    const pfrRows = [
      { pfr_player_id: "GoffJa00", pfr_player_name: "Jared Goff" },
      { pfr_player_id: "Zzz" },
    ];
    expect(() => checkCrosswalk(cwOne, pfrRows)).toThrow(/Jared Goff \(GoffJa00\), \? \(Zzz\)/);
  });
});

function row(overrides: Partial<PlayersRow>): PlayersRow {
  return {
    gsis_id: "g",
    display_name: "Some One",
    pfr_id: "p",
    espn_id: null,
    position: "QB",
    position_group: "QB",
    ngs_position: null,
    jersey_number: 1,
    latest_team: "DET",
    status: "ACT",
    ...overrides,
  };
}
