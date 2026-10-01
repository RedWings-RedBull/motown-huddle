import { describe, expect, it } from "vitest";

import { InjuryRow, WeeklyRosterRow } from "../src/columns.js";
import { parseCsvText } from "../src/csv.js";
import { buildRoster, positionGroupFor } from "../src/roster/build.js";

const ROSTER_CSV = `season,team,position,depth_chart_position,jersey_number,status,full_name,first_name,last_name,birth_date,height,weight,college,gsis_id,espn_id,pfr_id,years_exp,ngs_position,week,game_type,rookie_year,draft_club,draft_number
2026,DET,QB,QB,16,ACT,Jared Goff,Jared,Goff,1994-10-14,76,217,California,00-0033106,3046779,GoffJa00,10,QB,4,REG,2016,LA,1
2026,DET,QB,QB,16,ACT,Jared Goff,Jared,Goff,1994-10-14,76,217,California,00-0033106,3046779,GoffJa00,10,QB,3,REG,2016,LA,1
2026,DET,T,LT,58,ACT,Penei Sewell,Penei,Sewell,2000-10-09,77,335,Oregon,00-0036908,4361423,SewePe00,5,,4,REG,2021,DET,7
2026,DET,DE,DE,97,RES,Aidan Hutchinson,Aidan,Hutchinson,2000-08-09,79,268,Michigan,00-0037239,4426385,HutcAi00,4,EDGE,4,REG,2022,DET,2
2026,DET,LS,LS,44,ACT,Hogan Hatten,Hogan,Hatten,2000-02-15,75,235,Idaho,00-0039987,NA,NA,0,,4,REG,NA,NA,NA
2026,CHI,QB,QB,18,ACT,Caleb Williams,Caleb,Williams,2001-11-18,73,215,USC,00-0039918,4431611,WillCa04,2,QB,4,REG,2024,CHI,1
`;

const INJURY_CSV = `season,team,week,gsis_id,report_primary_injury,report_status,practice_status
2026,DET,4,00-0037239,Knee,Out,Did Not Participate In Practice
2026,DET,3,00-0033106,Ankle,Questionable,Limited Participation in Practice
`;

describe("buildRoster", () => {
  it("keeps the latest regular-season week for the team, joins injuries and sorts by group", async () => {
    const rows = await parseCsvText(ROSTER_CSV, { schema: WeeklyRosterRow, label: "roster" });
    const injuries = await parseCsvText(INJURY_CSV, { schema: InjuryRow, label: "injuries" });
    const roster = buildRoster(rows, injuries, "DET", 2026);

    expect(roster.week).toBe(4);
    expect(roster.players.map((p) => p.lastName)).toEqual([
      "Goff",
      "Sewell",
      "Hutchinson",
      "Hatten",
    ]);
    expect(roster.players.map((p) => p.positionGroup)).toEqual(["QB", "OL", "EDGE", "ST"]);

    const goff = roster.players[0];
    expect(goff?.jersey).toBe(16);
    expect(goff?.draft).toEqual({ year: 2016, club: "LA", overall: 1 });
    expect(goff?.injury).toBeNull(); // week-3 report is superseded by week 4
    expect(roster.players[2]?.injury).toEqual({
      reportStatus: "Out",
      primary: "Knee",
      practiceStatus: "Did Not Participate In Practice",
    });
    expect(roster.players[3]?.ids).toEqual({ pfr: null, espn: null });
    expect(roster.players[3]?.draft).toBeNull();
  });

  it("uses players.csv roles when the weekly roster lists generic DL/DB", async () => {
    const rows = await parseCsvText(
      ROSTER_CSV.replace("DET,DE,DE,97", "DET,DL,DE,97").replace(
        "00-0037239,4426385,HutcAi00,4,EDGE",
        "00-0037239,4426385,HutcAi00,4,",
      ),
      { schema: WeeklyRosterRow, label: "roster" },
    );
    const info = new Map([["00-0037239", { position: "DE", ngsPosition: "EDGE" }]]);
    const without = buildRoster(rows, [], "DET", 2026);
    const withInfo = buildRoster(rows, [], "DET", 2026, info);
    expect(without.players.find((p) => p.lastName === "Hutchinson")?.positionGroup).toBe("DL");
    expect(withInfo.players.find((p) => p.lastName === "Hutchinson")?.positionGroup).toBe("EDGE");
    expect(withInfo.players.find((p) => p.lastName === "Hutchinson")?.position).toBe("DE");
  });

  it("is deterministic", async () => {
    const rows = await parseCsvText(ROSTER_CSV, { schema: WeeklyRosterRow, label: "roster" });
    const a = buildRoster(rows, [], "DET", 2026);
    const b = buildRoster([...rows].reverse(), [], "DET", 2026);
    expect(a).toEqual(b);
  });
});

describe("positionGroupFor", () => {
  it("prefers the NGS role and falls back to the listed position", () => {
    expect(positionGroupFor("DE", "EDGE")).toBe("EDGE");
    expect(positionGroupFor("DT", "INTERIOR_LINE")).toBe("DL");
    expect(positionGroupFor("G", null)).toBe("OL");
    expect(positionGroupFor("LS", null)).toBe("ST");
    expect(positionGroupFor("K", null)).toBe("ST");
  });
});
