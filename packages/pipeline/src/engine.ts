import { GRADES_VERSION, gradeWeek } from "@huddle/grades";
import type { GradeRequest, Grades, LeagueBaselines } from "@huddle/shared";

/** The fixed cross-package contract with @huddle/grades; tests inject a stub through this shape. */
export interface Engine {
  gradeWeek(request: GradeRequest): { grades: Grades; baselines: LeagueBaselines };
  gradesVersion: string;
}

export const gradesEngine: Engine = { gradeWeek, gradesVersion: GRADES_VERSION };
