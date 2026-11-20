/**
 * The quarter's rhythm: when the weekly review is open, when the next quarter
 * can be planned, and when an unsorted retro gives up. Pure and isomorphic.
 */
import {
  addDays,
  quarterOf,
  quarterWeeks,
  shiftQuarter,
  weekStartOf,
  weekday,
  type IsoDay,
  type QuarterKey,
  type WeekStart,
} from "./dates.ts";

/** Planning for the next quarter opens this many days before the current one ends. */
export const PLANNING_LEAD_DAYS = 14;
/** Goals left unsorted this long after their quarter ends are dropped automatically. */
export const RETRO_GRACE_DAYS = 14;

export const firstDay = (q: QuarterKey, weekStart: WeekStart): IsoDay =>
  quarterWeeks(q, weekStart)[0]!;
export const lastDay = (q: QuarterKey, weekStart: WeekStart): IsoDay =>
  addDays(quarterWeeks(q, weekStart).at(-1)!, 6);

/**
 * The week whose review is open today, or null. The review opens on Friday and
 * stays open through the following Tuesday, so a missed Sunday is fine.
 */
export function reviewWeek(today: IsoDay, weekStart: WeekStart): IsoDay | null {
  const d = weekday(today); // 0 = Mon
  if (d === 2 || d === 3) return null; // Wed, Thu
  // Anchor on the Friday being reviewed: it sits inside that week for either start day.
  const friday = d >= 4 ? addDays(today, 4 - d) : addDays(today, -(d + 3));
  return weekStartOf(friday, weekStart);
}

/** Can the next quarter be planned yet? */
export function planningOpen(today: IsoDay, weekStart: WeekStart): boolean {
  const q = quarterOf(today, weekStart);
  return addDays(lastDay(q, weekStart), -PLANNING_LEAD_DAYS) < today;
}

/** The day after which the previous quarter's unsorted goals are dropped. */
export function retroDeadline(previous: QuarterKey, weekStart: WeekStart): IsoDay {
  return addDays(lastDay(previous, weekStart), RETRO_GRACE_DAYS);
}

export const previousQuarter = (today: IsoDay, weekStart: WeekStart) =>
  shiftQuarter(quarterOf(today, weekStart), -1);

export const nextQuarter = (today: IsoDay, weekStart: WeekStart) =>
  shiftQuarter(quarterOf(today, weekStart), 1);

/** How a quarter relates to today. */
export type QuarterMode = "past" | "current" | "planning";

export function quarterMode(
  q: QuarterKey,
  today: IsoDay,
  weekStart: WeekStart,
): QuarterMode | null {
  const cur = quarterOf(today, weekStart);
  const i = (k: QuarterKey) => k.year * 4 + k.quarter;
  if (i(q) < i(cur)) return "past";
  if (i(q) === i(cur)) return "current";
  if (i(q) === i(cur) + 1 && planningOpen(today, weekStart)) return "planning";
  return null;
}
