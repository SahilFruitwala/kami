/**
 * Compass rules, derived from raw rows: what is due, weekly targets,
 * consistency, goal progress and pace, and streaks with passes. Pure and
 * isomorphic so the server and the browser agree, and so it is easy to test.
 */
import {
  addDays,
  daysBetween,
  quarterId,
  quarterOf,
  quarterOfWeek,
  weekStartOf,
  weekday,
  weekDays,
  type IsoDay,
  type WeekStart,
} from "./dates.ts";

export type ScheduleRule =
  { rule: "daily" } | { rule: "days"; days: number[] } | { rule: "per_week"; perWeek: number };

export type HabitSchedule = ScheduleRule & { startsOn: IsoDay };

export type HabitKind = "check" | "count";

export type EngineHabit = {
  id: string;
  kind: HabitKind;
  /** Daily amount for a counted habit. */
  target: number | null;
  createdOn: IsoDay;
  pausedOn: IsoDay | null;
  pauses: { from: IsoDay; to: IsoDay }[];
  /** Oldest first. Never empty. */
  schedules: HabitSchedule[];
};

/** habitId → day → value. */
export type LogMap = Map<string, Map<IsoDay, number>>;

export type Weight = "S" | "M" | "L";
export const WEIGHT_POINTS: Record<Weight, number> = { S: 1, M: 2, L: 3 };

/** How far back a check-in can be changed: today and the 6 days before. */
export const EDIT_WINDOW_DAYS = 7;

export const canEditDay = (day: IsoDay, today: IsoDay) => {
  const back = daysBetween(day, today);
  return back >= 0 && back < EDIT_WINDOW_DAYS;
};

/** How far back a new habit's start can be set, to log the days before it was added. */
export const BACKDATE_MAX_DAYS = 56;

/**
 * Whether a habit's check-in for `day` can be changed. Normally that's the
 * edit window; for the first week after a habit is added (`addedOn`), every
 * day since its start is open too, so history from before it was added can
 * be filled in.
 */
export const canLogDay = (
  habit: { createdOn: IsoDay; addedOn?: IsoDay },
  day: IsoDay,
  today: IsoDay,
) => {
  if (day < habit.createdOn || day > today) return false;
  if (canEditDay(day, today)) return true;
  return !!habit.addedOn && daysBetween(habit.addedOn, today) < EDIT_WINDOW_DAYS;
};

// ---------- Schedules ----------

export function scheduleOn(habit: EngineHabit, day: IsoDay): HabitSchedule {
  let current = habit.schedules[0]!;
  for (const s of habit.schedules) if (s.startsOn <= day) current = s;
  return current;
}

export function weeklyTarget(rule: ScheduleRule): number {
  if (rule.rule === "daily") return 7;
  if (rule.rule === "days") return rule.days.length;
  return rule.perWeek;
}

/** Habits due most days get 5 passes a quarter; the rest get 3. */
export const passesFor = (rule: ScheduleRule) => (weeklyTarget(rule) >= 4 ? 5 : 3);

/** Due on this weekday? Times-a-week habits can be done any day. */
export function scheduledOn(rule: ScheduleRule, day: IsoDay): boolean {
  if (rule.rule === "days") return rule.days.includes(weekday(day));
  return true;
}

export function isPaused(habit: EngineHabit, day: IsoDay): boolean {
  if (habit.pausedOn && day >= habit.pausedOn) return true;
  return habit.pauses.some((p) => day >= p.from && day <= p.to);
}

/** Exists, and not paused, on this day. */
export const isActive = (habit: EngineHabit, day: IsoDay) =>
  day >= habit.createdOn && !isPaused(habit, day);

export function isMet(habit: EngineHabit, value: number | undefined): boolean {
  if (!value) return false;
  return habit.kind === "count" ? value >= (habit.target ?? 1) : value >= 1;
}

export const logOf = (logs: LogMap, habitId: string, day: IsoDay) => logs.get(habitId)?.get(day);

export const metOn = (habit: EngineHabit, logs: LogMap, day: IsoDay) =>
  isMet(habit, logOf(logs, habit.id, day));

// ---------- Weeks ----------

export type WeekStat = { done: number; target: number };

/**
 * Check-ins and target for one week. The target only counts days the habit
 * existed and was not paused, so a habit added mid-week or paused is not
 * held to a full week.
 */
export function weekStat(habit: EngineHabit, logs: LogMap, start: IsoDay): WeekStat {
  const rule = scheduleOn(habit, start);
  const days = weekDays(start);
  const active = days.filter((d) => isActive(habit, d));
  const done = active.filter((d) => metOn(habit, logs, d)).length;
  let target: number;
  if (rule.rule === "per_week") {
    target = active.length === 7 ? rule.perWeek : Math.ceil((rule.perWeek * active.length) / 7);
  } else {
    target = active.filter((d) => scheduledOn(rule, d)).length;
  }
  return { done, target };
}

export const weekRatio = ({ done, target }: WeekStat) =>
  target ? Math.min(1, done / target) : null;

/** Is the habit on today's list? */
export function dueToday(
  habit: EngineHabit,
  logs: LogMap,
  today: IsoDay,
  weekStart: WeekStart,
): boolean {
  if (!isActive(habit, today)) return false;
  const rule = scheduleOn(habit, today);
  if (rule.rule !== "per_week") return scheduledOn(rule, today);
  if (metOn(habit, logs, today)) return true;
  const { done, target } = weekStat(habit, logs, weekStartOf(today, weekStart));
  return done < target;
}

/**
 * Share of weekly targets hit across the given weeks. Weeks that have not
 * finished yet are left out unless already met, so Monday never drags it down.
 */
export function consistency(
  habit: EngineHabit,
  logs: LogMap,
  weeks: IsoDay[],
  today: IsoDay,
): number | null {
  const ratios: number[] = [];
  for (const start of weeks) {
    if (start > today) break;
    const r = weekRatio(weekStat(habit, logs, start));
    if (r === null) continue;
    const finished = addDays(start, 6) < today;
    if (finished || r >= 1) ratios.push(r);
  }
  if (!ratios.length) return null;
  return ratios.reduce((a, b) => a + b, 0) / ratios.length;
}

// ---------- Goals ----------

export type EngineMilestone = { weight: Weight; done: boolean };

/** Weighted share of milestones done, or null when the goal has none. */
export function goalProgress(milestones: EngineMilestone[]): number | null {
  if (!milestones.length) return null;
  const total = milestones.reduce((n, m) => n + WEIGHT_POINTS[m.weight], 0);
  const done = milestones.filter((m) => m.done).reduce((n, m) => n + WEIGHT_POINTS[m.weight], 0);
  return done / total;
}

/** A little slack so a goal one milestone behind on day one isn't "behind". */
export const PACE_SLACK = 0.05;

export const onPace = (progress: number, elapsed: number) => progress >= elapsed - PACE_SLACK;

// ---------- Streaks ----------

export type Streak = {
  current: number;
  best: number;
  /** Passes left in the current quarter, and how many it started with. */
  passesLeft: number;
  passesTotal: number;
  /** The most recent day (or week start) a pass covered, if any. */
  lastPassOn: IsoDay | null;
};

/**
 * Walk the habit's occurrences from its first day to today. Each one met adds
 * to the streak. A missed one spends a pass from that occurrence's quarter if
 * any are left (the streak carries on), otherwise the streak resets. Paused
 * days are skipped. Today, or the current week for times-a-week habits, is
 * still open: missing it so far breaks nothing.
 *
 * - Every day / specific days: occurrences are scheduled days.
 * - Times a week: occurrences are the check-ins inside a week that hit its
 *   target. Skipping a day does not break the streak. A finished week that
 *   misses its target spends a pass or resets it, and that week's check-ins
 *   do not count. The current week counts as soon as its target is met.
 */
export function streak(
  habit: EngineHabit,
  logs: LogMap,
  today: IsoDay,
  weekStart: WeekStart,
): Streak {
  const used = new Map<string, number>();
  let current = 0;
  let best = 0;
  let lastPassOn: IsoDay | null = null;

  const miss = (on: IsoDay, quarter: string, allowance: number) => {
    const n = used.get(quarter) ?? 0;
    if (n < allowance) {
      used.set(quarter, n + 1);
      lastPassOn = on;
    } else {
      current = 0;
    }
  };
  const hit = () => {
    current += 1;
    best = Math.max(best, current);
  };

  const todayRule = scheduleOn(habit, today);
  if (todayRule.rule === "per_week") {
    const thisWeek = weekStartOf(today, weekStart);
    for (let w = weekStartOf(habit.createdOn, weekStart); w <= thisWeek; w = addDays(w, 7)) {
      const rule = scheduleOn(habit, w);
      const stat = weekStat(habit, logs, w);
      if (stat.target === 0) continue;
      if (stat.done >= stat.target) {
        for (const d of weekDays(w)) {
          if (d > today || !isActive(habit, d)) continue;
          if (metOn(habit, logs, d)) hit();
        }
      } else if (w !== thisWeek) {
        miss(w, quarterId(quarterOfWeek(w)), passesFor(rule));
      }
    }
  } else {
    for (let d = habit.createdOn; d <= today; d = addDays(d, 1)) {
      if (isPaused(habit, d)) continue;
      const rule = scheduleOn(habit, d);
      if (!scheduledOn(rule, d)) continue;
      if (metOn(habit, logs, d)) hit();
      else if (d !== today) miss(d, quarterId(quarterOf(d, weekStart)), passesFor(rule));
    }
  }

  const total = passesFor(todayRule);
  const usedNow = used.get(quarterId(quarterOf(today, weekStart))) ?? 0;
  return {
    current,
    best,
    passesLeft: Math.max(0, total - usedNow),
    passesTotal: total,
    lastPassOn,
  };
}
