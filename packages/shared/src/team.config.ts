/**
 * The single fork point. Everything team- or brand-specific lives here; the rest of the
 * repository reads from this object. To run this kit for another team, change this file.
 */
export const teamConfig = {
  /** nflverse / NFL three-letter team code. */
  team: "DET",
  teamName: "Detroit Lions",
  city: "Detroit",
  conference: "NFC",
  division: "NFC North",
  /** Brand. Never a team mark. Overridable at build time with PUBLIC_SITE_NAME. */
  siteName: "Motown Huddle",
  tagline: "Detroit Lions analytics, built in the open.",
  /** Theme tokens. Honolulu blue and silver are colour names, not marks. */
  colors: {
    primary: "#0076B6",
    secondary: "#B0B7BC",
    ink: "#0B1F33",
  },
  /** Bumping this re-prompts every picks-game user to accept the terms. */
  playTermsVersion: "v1",
  /** Disclaimer rendered in every footer. */
  disclaimer:
    "Unofficial fan site. Not affiliated with or endorsed by the Detroit Lions, the NFL, or the NFLPA. Team names and marks belong to their owners.",
  /** Background photograph credit (CC licence requires it); null for a plain background. */
  backgroundCredit: {
    text: "Background: Ford Field by Michael Barera, CC BY-SA 4.0, via Wikimedia Commons",
    url: "https://commons.wikimedia.org/wiki/File:Detroit_December_2015_06_(Ford_Field).jpg",
  },
  attribution:
    "Data: nflverse (CC-BY 4.0) · Charting: FTN Data via nflverse (CC-BY-SA 4.0) · Advanced stats: Pro-Football-Reference via nflverse · Schedule and lines: nflverse (Lee Sharpe)",
} as const;

export type TeamConfig = typeof teamConfig;
