import type { Slot, Unit } from "@huddle/shared";

export interface SlotMeta {
  readonly label: string;
  readonly unit: Unit;
  /** OL slots show the unit grade; the engine never fabricates a per-lineman grade. */
  readonly unitOnly: boolean;
}

const offense = (label: string, unitOnly = false): SlotMeta => ({
  label,
  unit: "offense",
  unitOnly,
});
const defense = (label: string): SlotMeta => ({ label, unit: "defense", unitOnly: false });
const st = (label: string): SlotMeta => ({ label, unit: "st", unitOnly: false });

/** Label and unit for each of the 27 field slots, keyed by the shared `Slot` enum. */
export const SLOT_META: Readonly<Record<Slot, SlotMeta>> = {
  QB: offense("Quarterback"),
  RB: offense("Running back"),
  WR1: offense("Wide receiver 1"),
  WR2: offense("Wide receiver 2"),
  WR3: offense("Wide receiver 3"),
  TE: offense("Tight end"),
  LT: offense("Left tackle", true),
  LG: offense("Left guard", true),
  C: offense("Center", true),
  RG: offense("Right guard", true),
  RT: offense("Right tackle", true),
  EDGE_L: defense("Left edge"),
  IDL_L: defense("Left interior"),
  IDL_R: defense("Right interior"),
  EDGE_R: defense("Right edge"),
  LB1: defense("Linebacker 1"),
  LB2: defense("Linebacker 2"),
  CB_L: defense("Left cornerback"),
  CB_R: defense("Right cornerback"),
  NB: defense("Nickel"),
  S1: defense("Safety 1"),
  S2: defense("Safety 2"),
  K: st("Kicker"),
  P: st("Punter"),
  LS: st("Long snapper"),
  KR: st("Kick returner"),
  PR: st("Punt returner"),
};
