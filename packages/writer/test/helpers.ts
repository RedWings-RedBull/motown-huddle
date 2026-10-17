import { fileURLToPath } from "node:url";

/** Frozen copy of the site data for 2026 week 3 (plus the division and preview files of that time). */
export const DATA_DIR = fileURLToPath(new URL("./fixtures/data/", import.meta.url));

const FILLER =
  "The offense kept finding answers on early downs and the defense tightened when the field shrank, which is the pattern that decided the afternoon.";

/** A grounded week 3 recap body, padded to a realistic length with fact-free sentences. */
export function groundedRecap(extra = ""): { title: string; description: string; body: string } {
  const paragraphs = [
    "The Detroit Lions beat the New York Jets 31-24 at Ford Field, and the margin came late.",
    "Jahmyr Gibbs went 17 yards for a touchdown in the third quarter [p:2265].",
    "Jared Goff found Gibbs for 11 yards and the go-ahead touchdown [p:3817].",
    "The strip-sack by Clark ended it [p:4086].",
    extra,
    ...Array.from({ length: 20 }, () => FILLER),
  ].filter(Boolean);
  return {
    title: "Lions hold off the Jets in a late swing at Ford Field",
    description:
      "Detroit beat New York 31-24 behind Gibbs and a closing strip-sack, but the defense gave up plenty along the way.",
    body: `## How it was won\n\n${paragraphs.join("\n\n")}`,
  };
}
