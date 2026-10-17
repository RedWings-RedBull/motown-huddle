import type { GapHeat as GapHeatInputSchema } from "@huddle/shared";
import type { z } from "zod";

import type { PbpRow } from "../columns.js";
import { isDesignedRush } from "./context.js";

export type GapHeatInput = z.infer<typeof GapHeatInputSchema>;
export type Zone = GapHeatInput["zone"];
const ZONES: readonly Zone[] = ["LT", "LG", "C", "RG", "RT"];

interface Cell {
  epa: number;
  success: number;
  n: number;
}
const emptyCell = (): Cell => ({ epa: 0, success: 0, n: 0 });

/** run_location x run_gap -> line zone. Middle runs (no gap) go to C. */
export function zoneFor(location: string | null, gap: string | null): Zone | null {
  if (location === "middle") return "C";
  if (location === "left") {
    if (gap === "guard") return "LG";
    if (gap === "tackle" || gap === "end") return "LT";
    return "LG";
  }
  if (location === "right") {
    if (gap === "guard") return "RG";
    if (gap === "tackle" || gap === "end") return "RT";
    return "RG";
  }
  return null;
}

/** Rush EPA and success rate of the team's designed runs per line zone (all five zones present). */
export function gapHeat(pbp: readonly PbpRow[], gameId: string, team: string): GapHeatInput[] {
  const acc: Record<Zone, Cell> = {
    LT: emptyCell(),
    LG: emptyCell(),
    C: emptyCell(),
    RG: emptyCell(),
    RT: emptyCell(),
  };
  for (const p of pbp) {
    if (p.game_id !== gameId || p.posteam !== team || !isDesignedRush(p)) continue;
    const zone = zoneFor(p.run_location, p.run_gap);
    if (zone === null || p.epa === null) continue;
    const cell = acc[zone];
    cell.n += 1;
    cell.epa += p.epa;
    cell.success += p.success ?? 0;
  }
  return ZONES.map((zone) => {
    const cell = acc[zone];
    return {
      zone,
      epaPerRush: cell.n === 0 ? 0 : cell.epa / cell.n,
      successRate: cell.n === 0 ? 0 : cell.success / cell.n,
      n: cell.n,
    };
  });
}
