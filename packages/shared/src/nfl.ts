/**
 * League structure. nflverse team codes; the schedule file carries no conference column, so this
 * is the one place that knows which division each club plays in.
 */
export const DIVISIONS = {
  "AFC East": ["BUF", "MIA", "NE", "NYJ"],
  "AFC North": ["BAL", "CIN", "CLE", "PIT"],
  "AFC South": ["HOU", "IND", "JAX", "TEN"],
  "AFC West": ["DEN", "KC", "LAC", "LV"],
  "NFC East": ["DAL", "NYG", "PHI", "WAS"],
  "NFC North": ["CHI", "DET", "GB", "MIN"],
  "NFC South": ["ATL", "CAR", "NO", "TB"],
  "NFC West": ["ARI", "LA", "SEA", "SF"],
} as const satisfies Record<string, readonly string[]>;

export type Division = keyof typeof DIVISIONS;
export type Conference = "AFC" | "NFC";

const DIVISION_OF = new Map<string, Division>();
for (const [division, teams] of Object.entries(DIVISIONS) as [Division, readonly string[]][]) {
  for (const team of teams) DIVISION_OF.set(team, division);
}

export const ALL_TEAMS: readonly string[] = [...DIVISION_OF.keys()].sort();

export function divisionOf(team: string): Division {
  const division = DIVISION_OF.get(team);
  if (division === undefined) throw new Error(`Unknown team code: ${team}`);
  return division;
}

export function conferenceOf(team: string): Conference {
  return divisionOf(team).startsWith("AFC") ? "AFC" : "NFC";
}

export function divisionTeams(division: Division): readonly string[] {
  return DIVISIONS[division];
}

export function conferenceTeams(conference: Conference): readonly string[] {
  return ALL_TEAMS.filter((t) => conferenceOf(t) === conference);
}

/** Club names for display. Names are nominative use; marks and logos are never rendered. */
export const TEAM_NAMES: Readonly<Record<string, string>> = {
  ARI: "Arizona Cardinals",
  ATL: "Atlanta Falcons",
  BAL: "Baltimore Ravens",
  BUF: "Buffalo Bills",
  CAR: "Carolina Panthers",
  CHI: "Chicago Bears",
  CIN: "Cincinnati Bengals",
  CLE: "Cleveland Browns",
  DAL: "Dallas Cowboys",
  DEN: "Denver Broncos",
  DET: "Detroit Lions",
  GB: "Green Bay Packers",
  HOU: "Houston Texans",
  IND: "Indianapolis Colts",
  JAX: "Jacksonville Jaguars",
  KC: "Kansas City Chiefs",
  LA: "Los Angeles Rams",
  LAC: "Los Angeles Chargers",
  LV: "Las Vegas Raiders",
  MIA: "Miami Dolphins",
  MIN: "Minnesota Vikings",
  NE: "New England Patriots",
  NO: "New Orleans Saints",
  NYG: "New York Giants",
  NYJ: "New York Jets",
  PHI: "Philadelphia Eagles",
  PIT: "Pittsburgh Steelers",
  SEA: "Seattle Seahawks",
  SF: "San Francisco 49ers",
  TB: "Tampa Bay Buccaneers",
  TEN: "Tennessee Titans",
  WAS: "Washington Commanders",
};

export const teamName = (code: string): string => TEAM_NAMES[code] ?? code;
