import type { Tier } from "@huddle/shared";

import type {
  DepthChartRow,
  FtnRow,
  GamesRow,
  NgsPassingRow,
  NgsReceivingRow,
  NgsRushingRow,
  PbpRow,
  PfrDefRow,
  PfrPassRow,
  PfrRecRow,
  PfrRushRow,
  SnapCountRow,
  StatsPlayerRow,
} from "./columns.js";
import type { Crosswalk } from "./crosswalk.js";
import type { ResolvedGame } from "./stages/resolveGame.js";

/** PFR advanced stats for the week; null in the provisional tier. */
interface PfrInputs {
  pass: PfrPassRow[];
  rush: PfrRushRow[];
  rec: PfrRecRow[];
  def: PfrDefRow[];
}

interface NgsInputs {
  passing: NgsPassingRow[];
  rushing: NgsRushingRow[];
  receiving: NgsReceivingRow[];
}

/** Everything the pure stages need for one league week, already filtered to (season, week). */
export interface WeekInputs {
  season: number;
  week: number;
  tier: Tier;
  team: string;
  game: ResolvedGame;
  games: GamesRow[];
  /** Every play of every game that week. */
  pbp: PbpRow[];
  stats: StatsPlayerRow[];
  snaps: SnapCountRow[];
  ftn: FtnRow[];
  ngs: NgsInputs;
  pfr: PfrInputs | null;
  /** Depth-chart rows for all teams inside the week's window (see depthChartSnapshot). */
  depthCharts: DepthChartRow[];
  /** team -> kickoffUtc for every game that week. */
  kickoffs: Map<string, string>;
  crosswalk: Crosswalk;
  /** nflverse release tag -> timestamp.txt used for this build. */
  sources: Record<string, string>;
}
