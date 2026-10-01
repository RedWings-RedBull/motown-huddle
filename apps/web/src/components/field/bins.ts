import type { BinRange } from "@huddle/grades";
import type { Bin } from "@huddle/shared";

/**
 * Presentation of the engine's seven bins. `BIN_TABLE` mirrors `BINS` in @huddle/grades (the
 * table `binFor` bins with) rather than importing it: a runtime import would pull the engine's
 * spec module, and zod with it, into the client island. The methodology page compares the two at
 * build time and fails the build if they drift. Fills are the ColorBrewer RdBu-7 diverging scale
 * (blue is cold, red is hot); they are data colours and stay the same in dark mode, and the text
 * colour per bin keeps WCAG AA contrast.
 */
export const BIN_TABLE: readonly BinRange[] = [
  { bin: "fire", label: "On fire", min: 90, max: 100 },
  { bin: "hot", label: "Hot", min: 75, max: 89 },
  { bin: "warm", label: "Warm", min: 60, max: 74 },
  { bin: "neutral", label: "Neutral", min: 40, max: 59 },
  { bin: "cool", label: "Cool", min: 25, max: 39 },
  { bin: "cold", label: "Cold", min: 10, max: 24 },
  { bin: "ice", label: "Ice", min: 0, max: 9 },
];

export const BIN_FILL: Record<Bin, string> = {
  ice: "#2166ac",
  cold: "#67a9cf",
  cool: "#d1e5f0",
  neutral: "#f7f7f7",
  warm: "#fddbc7",
  hot: "#ef8a62",
  fire: "#b2182b",
  na: "#9ca3af",
};

export const BIN_TEXT: Record<Bin, string> = {
  ice: "#ffffff",
  cold: "#0b1f33",
  cool: "#0b1f33",
  neutral: "#0b1f33",
  warm: "#0b1f33",
  hot: "#0b1f33",
  fire: "#ffffff",
  na: "#0b1f33",
};

function fromBins<T>(pick: (b: BinRange) => T, na: T): Record<Bin, T> {
  const out: Partial<Record<Bin, T>> = { na };
  for (const b of BIN_TABLE) out[b.bin] = pick(b);
  return out as Record<Bin, T>;
}

export const BIN_LABEL: Record<Bin, string> = fromBins((b) => b.label, "Not graded");

export const BIN_RANGE: Record<Bin, string> = fromBins(
  (b) => `${b.min}–${b.max}`,
  "DNP, below threshold or pending",
);

/** Best to worst, then "not graded": the legend order. */
export const BIN_ORDER: readonly Bin[] = [...BIN_TABLE.map((b) => b.bin), "na"];

/** Non-colour cue: hatching on the cold side, dots on the hot side, nothing in the middle. */
function binCue(bin: Bin): "hatch" | "dots" | null {
  if (bin === "ice" || bin === "cold" || bin === "cool") return "hatch";
  if (bin === "warm" || bin === "hot" || bin === "fire") return "dots";
  return null;
}

/**
 * SVG pattern id for the bin's cue. The two extreme bins have dark fills, so their marks are drawn
 * in the bin's (white) text colour to stay visible.
 */
export function binPattern(bin: Bin): string | null {
  const cue = binCue(bin);
  if (cue === null) return null;
  return `hm-${cue}${BIN_TEXT[bin] === "#ffffff" ? "-light" : ""}`;
}
