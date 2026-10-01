import { describe, expect, it } from "vitest";

import { NotReadyError } from "../src/errors.js";
import { assertReady, type ReadinessCounts } from "../src/stages/readiness.js";

const GAME = "2026_03_NYJ_DET";
const ready = (tier: "provisional" | "final", counts: ReadinessCounts) => () => {
  assertReady(tier, GAME, counts);
};

describe("assertReady", () => {
  it("passes a provisional build with pbp and snap rows", () => {
    expect(ready("provisional", { pbpRows: 167, snapRows: 92 })).not.toThrow();
  });

  it("fails provisional without pbp or snaps and names what is missing", () => {
    expect(ready("provisional", { pbpRows: 0, snapRows: 92 })).toThrow(NotReadyError);
    expect(ready("provisional", { pbpRows: 167, snapRows: 0 })).toThrow(/snap_counts/);
  });

  it("requires 20 PFR def rows and 2 pass rows for final", () => {
    const base = { pbpRows: 167, snapRows: 92 };
    expect(ready("final", { ...base, pfrDefRows: 25, pfrPassRows: 2 })).not.toThrow();
    expect(ready("final", { ...base, pfrDefRows: 19, pfrPassRows: 2 })).toThrow(
      /advstats_week_def has 19/,
    );
    expect(ready("final", { ...base, pfrDefRows: 25, pfrPassRows: 1 })).toThrow(
      /advstats_week_pass has 1/,
    );
    expect(ready("final", base)).toThrow(/def has 0 rows.*pass has 0 rows/);
  });
});
