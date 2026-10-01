import type { Slot, Unit } from "@huddle/shared";

/**
 * Tile centres on the drawn field. Two layouts share one slot list: the landscape field (viewBox
 * 0 0 1000 600) lines the offense up on the left of the line of scrimmage in 11 personnel against
 * a 4-2-5 nickel, with the special-teams strip under the field; the portrait layout for phones
 * (viewBox 0 0 380 560) stacks the same formation top to bottom with larger tiles and type so a
 * tile stays a real touch target (>= 24 px) and its label legible at 375 px.
 */
interface SlotPosition {
  readonly slot: Slot;
  readonly unit: Unit;
  readonly x: number;
  readonly y: number;
  /** Short on-tile label. */
  readonly label: string;
}

export interface FieldLayout {
  readonly orientation: "landscape" | "portrait";
  readonly viewW: number;
  readonly viewH: number;
  readonly tileW: number;
  readonly tileH: number;
  /** Inset of the painted label and grade from the tile edge. */
  readonly pad: number;
  /** Font sizes in viewBox units for the slot label and the grade digits. */
  readonly labelSize: number;
  readonly gradeSize: number;
  /** The playing field rectangle; its long axis runs with `orientation`. */
  readonly field: {
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;
  };
  /** Depth of each end zone along the field's long axis. */
  readonly endZone: number;
  /** Line of scrimmage: x in landscape, y in portrait. */
  readonly los: number;
  /** Where the special-teams strip starts (y). */
  readonly stStripTop: number;
  readonly positions: readonly SlotPosition[];
}

const SLOT_LABEL: Readonly<Record<Slot, string>> = {
  QB: "QB",
  RB: "RB",
  WR1: "WR",
  WR2: "WR",
  WR3: "SLOT",
  TE: "TE",
  LT: "LT",
  LG: "LG",
  C: "C",
  RG: "RG",
  RT: "RT",
  EDGE_L: "EDGE",
  IDL_L: "DT",
  IDL_R: "DT",
  EDGE_R: "EDGE",
  LB1: "LB",
  LB2: "LB",
  CB_L: "CB",
  CB_R: "CB",
  NB: "NB",
  S1: "S",
  S2: "S",
  K: "K",
  P: "P",
  LS: "LS",
  KR: "KR",
  PR: "PR",
};

const OFFENSE = new Set<Slot>(["QB", "RB", "WR1", "WR2", "WR3", "TE", "LT", "LG", "C", "RG", "RT"]);
const ST = new Set<Slot>(["K", "P", "LS", "KR", "PR"]);

function at(slot: Slot, x: number, y: number): SlotPosition {
  const unit: Unit = OFFENSE.has(slot) ? "offense" : ST.has(slot) ? "st" : "defense";
  return { slot, unit, x, y, label: SLOT_LABEL[slot] };
}

export const LANDSCAPE: FieldLayout = {
  orientation: "landscape",
  viewW: 1000,
  viewH: 600,
  tileW: 78,
  tileH: 46,
  pad: 8,
  labelSize: 11,
  gradeSize: 22,
  field: { x: 0, y: 20, w: 1000, h: 460 },
  endZone: 70,
  los: 500,
  stStripTop: 500,
  positions: [
    // Offense (11 personnel)
    at("WR1", 380, 60),
    at("WR3", 372, 120),
    at("LT", 452, 120),
    at("LG", 452, 172),
    at("C", 452, 224),
    at("RG", 452, 276),
    at("RT", 452, 328),
    at("TE", 452, 384),
    at("WR2", 380, 440),
    at("QB", 330, 224),
    at("RB", 250, 224),
    // Defense (4-2-5 nickel)
    at("EDGE_L", 548, 110),
    at("IDL_L", 548, 196),
    at("IDL_R", 548, 282),
    at("EDGE_R", 548, 368),
    at("CB_L", 630, 52),
    at("NB", 660, 130),
    at("LB1", 660, 210),
    at("LB2", 660, 290),
    at("CB_R", 630, 448),
    at("S1", 790, 170),
    at("S2", 790, 330),
    // Special teams strip
    at("K", 190, 548),
    at("P", 345, 548),
    at("LS", 500, 548),
    at("KR", 655, 548),
    at("PR", 810, 548),
  ],
};

/** Five columns of 70-wide tiles across a 380-wide viewBox, rows 58 apart. */
const COL = [45, 118, 190, 262, 335] as const;

export const PORTRAIT: FieldLayout = {
  orientation: "portrait",
  viewW: 380,
  viewH: 560,
  tileW: 70,
  tileH: 48,
  pad: 6,
  labelSize: 12,
  gradeSize: 24,
  field: { x: 0, y: 8, w: 380, h: 456 },
  endZone: 20,
  los: 264,
  stStripTop: 474,
  positions: [
    // Offense drives down the screen toward the line of scrimmage.
    at("RB", COL[2], 54),
    at("QB", COL[2], 112),
    at("WR1", COL[0], 170),
    at("WR3", COL[1], 170),
    at("TE", COL[3], 170),
    at("WR2", COL[4], 170),
    at("LT", COL[0], 228),
    at("LG", COL[1], 228),
    at("C", COL[2], 228),
    at("RG", COL[3], 228),
    at("RT", COL[4], 228),
    // Defense answers below the line.
    at("EDGE_L", COL[0], 300),
    at("IDL_L", COL[1], 300),
    at("IDL_R", COL[3], 300),
    at("EDGE_R", COL[4], 300),
    at("CB_L", COL[0], 358),
    at("LB1", COL[1], 358),
    at("NB", COL[2], 358),
    at("LB2", COL[3], 358),
    at("CB_R", COL[4], 358),
    at("S1", COL[1], 416),
    at("S2", COL[3], 416),
    // Special teams strip
    at("K", COL[0], 524),
    at("P", COL[1], 524),
    at("LS", COL[2], 524),
    at("KR", COL[3], 524),
    at("PR", COL[4], 524),
  ],
};

export const UNIT_LABEL: Record<Unit, string> = {
  offense: "Offense",
  defense: "Defense",
  st: "Special teams",
};
