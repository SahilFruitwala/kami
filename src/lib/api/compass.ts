import type { z } from "zod";
import type { IsoDay, QuarterKey, WeekStart } from "@/lib/compass/dates";
import type { HabitKind, HabitSchedule, Weight } from "@/lib/compass/engine";
import { http, seg } from "./client";
import type {
  GoalColor,
  goalInput,
  habitInput,
  habitPatch,
  logInput,
  settingsInput,
} from "./schemas/compass";

export type CompassMilestone = {
  id: string;
  title: string;
  dueOn: IsoDay | null;
  weight: Weight;
  done: boolean;
};

export type CompassGoal = {
  id: string;
  name: string;
  why: string | null;
  color: GoalColor;
  milestones: CompassMilestone[];
};

export type CompassHabit = {
  id: string;
  /** Null = ongoing, not tied to a goal. */
  goalId: string | null;
  name: string;
  kind: HabitKind;
  target: number | null;
  unit: string | null;
  createdOn: IsoDay;
  pausedOn: IsoDay | null;
  pauses: { from: IsoDay; to: IsoDay }[];
  schedules: HabitSchedule[];
};

export type CompassLog = { habitId: string; day: IsoDay; value: number };

/** Everything Compass shows, as raw rows; the numbers are derived in the browser. */
export type CompassSnapshot = {
  today: IsoDay;
  timezone: string;
  weekStart: WeekStart;
  quarter: QuarterKey;
  goals: CompassGoal[];
  habits: CompassHabit[];
  logs: CompassLog[];
};

export type GoalInput = z.input<typeof goalInput>;
export type HabitInput = z.input<typeof habitInput>;
export type HabitPatch = z.input<typeof habitPatch>;
export type LogInput = z.input<typeof logInput>;
export type SettingsInput = z.input<typeof settingsInput>;

export const compassApi = {
  get: () => http.get<CompassSnapshot>("/api/compass"),
  settings: (input: SettingsInput) => http.patch<void>("/api/compass/settings", input),

  createGoal: (input: GoalInput) => http.post<{ id: string }>("/api/compass/goals", input),
  updateGoal: (id: string, input: GoalInput) =>
    http.patch<void>(`/api/compass/goals/${seg(id)}`, input),
  /** Drops the goal: it leaves the quarter and its habits are archived. */
  dropGoal: (id: string) => http.delete<void>(`/api/compass/goals/${seg(id)}`),
  setMilestone: (id: string, done: boolean) =>
    http.patch<void>(`/api/compass/milestones/${seg(id)}`, { done }),

  createHabit: (input: HabitInput) => http.post<{ id: string }>("/api/compass/habits", input),
  updateHabit: (id: string, patch: HabitPatch) =>
    http.patch<void>(`/api/compass/habits/${seg(id)}`, patch),
  /** Only allowed in a habit's first 7 days; archive it after that. */
  deleteHabit: (id: string) => http.delete<void>(`/api/compass/habits/${seg(id)}`),

  log: (input: LogInput) => http.put<void>("/api/compass/logs", input),
};
