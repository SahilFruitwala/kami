/**
 * The year view: four quarter columns with each goal's result and the
 * carry-over links between them, plus one row per habit with a square for
 * every week of the year. Pure.
 */
import type { QuarterGoal, YearRecord } from "@/lib/api/compass";
import type { GoalColor } from "./colors.ts";
import { addDays, quarterWeeks, type IsoDay, type QuarterKey } from "./dates.ts";
import { goalProgress, weekRatio, weekStat } from "./engine.ts";
import { toLogMap } from "./model.ts";

export type YearGoal = {
  goal: QuarterGoal;
  progress: number | null;
  /** Quarter this goal carried on from, and the one it carried into. */
  from: QuarterKey | null;
  to: QuarterKey | null;
};

export type YearHabitRow = {
  id: string;
  name: string;
  color: GoalColor | null;
  archived: boolean;
  /** One ratio per week of the year; null = no target, not started, or still ahead. */
  weeks: (number | null)[];
};

export type YearModel = {
  year: number;
  quarters: {
    quarter: QuarterKey;
    mode: YearRecord["quarters"][number]["mode"];
    goals: YearGoal[];
  }[];
  weeks: IsoDay[];
  /** Index of the first week of each quarter in `weeks`. */
  quarterStarts: number[];
  /** Index of today's week, or -1 when the year is not this one. */
  currentWeek: number;
  rows: YearHabitRow[];
};

export function buildYear(rec: YearRecord): YearModel {
  const goalQuarter = new Map<string, QuarterKey>();
  const carriedInto = new Map<string, QuarterKey>();
  for (const q of rec.quarters) {
    for (const g of q.goals) {
      goalQuarter.set(g.id, q.quarter);
      if (g.carriedFromGoalId) carriedInto.set(g.carriedFromGoalId, q.quarter);
    }
  }
  const quarters = rec.quarters.map((q) => ({
    quarter: q.quarter,
    mode: q.mode,
    goals: q.goals.map((goal) => ({
      goal,
      progress: goalProgress(goal.milestones.map((m) => ({ weight: m.weight, done: m.done }))),
      from: goal.carriedFromGoalId ? (goalQuarter.get(goal.carriedFromGoalId) ?? null) : null,
      to: goal.outcome === "carried" ? (carriedInto.get(goal.id) ?? null) : null,
    })),
  }));

  const weeks: IsoDay[] = [];
  const quarterStarts: number[] = [];
  for (const n of [1, 2, 3, 4] as const) {
    quarterStarts.push(weeks.length);
    weeks.push(...quarterWeeks({ year: rec.year, quarter: n }, rec.weekStart));
  }
  const currentWeek = weeks.findIndex((w) => w <= rec.today && rec.today <= addDays(w, 6));

  const colors = new Map<string, GoalColor>();
  for (const q of rec.quarters) for (const g of q.goals) colors.set(g.id, g.color);
  const logs = toLogMap(rec.logs);

  const rows: YearHabitRow[] = rec.habits.map((h) => ({
    id: h.id,
    name: h.name,
    color: h.goalId ? (colors.get(h.goalId) ?? null) : null,
    archived: !!h.archivedOn,
    weeks: weeks.map((w) => {
      if (w > rec.today) return null;
      if (addDays(w, 6) < h.createdOn) return null;
      if (h.archivedOn && w > h.archivedOn) return null;
      return weekRatio(weekStat(h, logs, w));
    }),
  }));

  return { year: rec.year, quarters, weeks, quarterStarts, currentWeek, rows };
}
