/**
 * Turns a Compass snapshot into what the screens show. Pure: the same
 * snapshot always gives the same numbers, on the server or in the browser.
 */
import type { CompassGoal, CompassHabit, CompassSnapshot } from "@/lib/api/compass";
import {
  addDays,
  quarterElapsed,
  quarterWeeks,
  weekStartOf,
  weekDays,
  type IsoDay,
  type WeekStart,
} from "./dates.ts";
import {
  canLogDay,
  consistency,
  dueToday,
  goalProgress,
  isActive,
  logOf,
  metOn,
  onPace,
  scheduleOn,
  scheduledOn,
  streak,
  weekRatio,
  weekStat,
  type LogMap,
  type Streak,
  type WeekStat,
} from "./engine.ts";

export type DayCell = {
  day: IsoDay;
  met: boolean;
  /** Scheduled that day (always true for times-a-week habits). */
  scheduled: boolean;
  editable: boolean;
  isToday: boolean;
  future: boolean;
  active: boolean;
};

export type HabitView = {
  habit: CompassHabit;
  goal: CompassGoal | null;
  value: number;
  metToday: boolean;
  dueToday: boolean;
  thisWeek: WeekStat;
  /** One ratio per quarter week (null = no target that week or not reached yet). */
  weeks: (number | null)[];
  days: DayCell[];
  /** Earlier weeks that can still be filled in, oldest first (empty once that window closes). */
  history: { week: IsoDay; days: DayCell[] }[];
  consistency: number | null;
  streak: Streak;
  paused: boolean;
};

export type GoalView = {
  goal: CompassGoal;
  habits: HabitView[];
  progress: number | null;
  onPace: boolean | null;
  consistency: number | null;
  next: CompassGoal["milestones"][number] | null;
  weekDone: number;
  weekTarget: number;
};

export type CompassModel = {
  today: IsoDay;
  weekNumber: number;
  weekCount: number;
  daysLeft: number;
  elapsed: number;
  weeks: IsoDay[];
  goals: GoalView[];
  ongoing: HabitView[];
  habits: HabitView[];
  todayList: HabitView[];
  /** Habits whose most recent pass covered yesterday (for the quiet morning note). */
  passNotes: HabitView[];
};

export function toLogMap(logs: CompassSnapshot["logs"]): LogMap {
  const map: LogMap = new Map();
  for (const l of logs) {
    let days = map.get(l.habitId);
    if (!days) map.set(l.habitId, (days = new Map()));
    days.set(l.day, l.value);
  }
  return map;
}

const average = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

/** Weeks before this one whose days can still be filled in for a habit. */
function earlierWeeks(
  habit: CompassHabit,
  thisWeek: IsoDay,
  today: IsoDay,
  weekStart: WeekStart,
): IsoDay[] {
  const out: IsoDay[] = [];
  for (let w = weekStartOf(habit.createdOn, weekStart); w < thisWeek; w = addDays(w, 7)) {
    // Only weeks with a day the edit rules still open.
    if (weekDays(w).some((d) => canLogDay(habit, d, today))) out.push(w);
  }
  return out;
}

export function buildModel(snap: CompassSnapshot): CompassModel {
  const { today, weekStart } = snap;
  const logs = toLogMap(snap.logs);
  const weeks = quarterWeeks(snap.quarter, weekStart);
  const thisWeek = weekStartOf(today, weekStart);
  const goalsById = new Map(snap.goals.map((g) => [g.id, g]));

  const habits: HabitView[] = snap.habits.map((habit) => {
    const cell = (day: IsoDay): DayCell => ({
      day,
      met: metOn(habit, logs, day),
      scheduled: scheduledOn(scheduleOn(habit, day), day),
      editable: canLogDay(habit, day, today),
      isToday: day === today,
      future: day > today,
      active: isActive(habit, day),
    });
    return {
      habit,
      goal: habit.goalId ? (goalsById.get(habit.goalId) ?? null) : null,
      value: logOf(logs, habit.id, today) ?? 0,
      metToday: metOn(habit, logs, today),
      dueToday: dueToday(habit, logs, today, weekStart),
      thisWeek: weekStat(habit, logs, thisWeek),
      weeks: weeks.map((w) => (w > today ? null : weekRatio(weekStat(habit, logs, w)))),
      days: weekDays(thisWeek).map(cell),
      history: earlierWeeks(habit, thisWeek, today, weekStart).map((week) => ({
        week,
        days: weekDays(week).map(cell),
      })),
      consistency: consistency(habit, logs, weeks, today),
      streak: streak(habit, logs, today, weekStart),
      paused: !!habit.pausedOn && habit.pausedOn <= today,
    };
  });

  const elapsed = quarterElapsed(snap.quarter, today, weekStart);
  const goals: GoalView[] = snap.goals.map((goal) => {
    const own = habits.filter((h) => h.habit.goalId === goal.id);
    const progress = goalProgress(goal.milestones);
    return {
      goal,
      habits: own,
      progress,
      onPace: progress === null ? null : onPace(progress, elapsed),
      consistency: average(own.map((h) => h.consistency)),
      next: goal.milestones.find((m) => !m.done) ?? null,
      weekDone: own.reduce((n, h) => n + Math.min(h.thisWeek.done, h.thisWeek.target), 0),
      weekTarget: own.reduce((n, h) => n + h.thisWeek.target, 0),
    };
  });

  const weekIndex = Math.max(0, weeks.indexOf(thisWeek));
  const lastDay = addDays(weeks.at(-1)!, 6);
  const yesterday = addDays(today, -1);

  return {
    today,
    weekNumber: weekIndex + 1,
    weekCount: weeks.length,
    daysLeft: Math.max(0, Math.round((Date.parse(lastDay) - Date.parse(today)) / 864e5)),
    elapsed,
    weeks,
    goals,
    ongoing: habits.filter((h) => !h.goal),
    habits,
    todayList: habits.filter((h) => h.dueToday),
    passNotes: habits.filter((h) => h.streak.lastPassOn === yesterday),
  };
}

/** Apply one check-in locally (optimistic update) and return the new snapshot. */
export function withLog(
  snap: CompassSnapshot,
  habitId: string,
  day: IsoDay,
  value: number,
): CompassSnapshot {
  const logs = snap.logs.filter((l) => !(l.habitId === habitId && l.day === day));
  if (value > 0) logs.push({ habitId, day, value });
  return { ...snap, logs };
}
