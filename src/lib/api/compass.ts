import type { z } from "zod";
import type { IsoDay, QuarterKey, WeekStart } from "@/lib/compass/dates";
import type { HabitKind, HabitSchedule, Weight } from "@/lib/compass/engine";
import { http, seg } from "./client";
import type {
  GoalColor,
  goalInput,
  habitInput,
  retroInput,
  reviewInput,
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
  /** First day that counts; can be earlier than `addedOn` when history was filled in. */
  createdOn: IsoDay;
  /** The user's local day the habit was actually added. */
  addedOn: IsoDay;
  pausedOn: IsoDay | null;
  pauses: { from: IsoDay; to: IsoDay }[];
  schedules: HabitSchedule[];
};

/** `auto` marks a day ticked by linked reading rather than by hand. */
export type CompassLog = { habitId: string; day: IsoDay; value: number; auto?: true };

export type ContributionUnit = "pages" | "percent" | "minutes" | "articles";

/** What a linked book or article added to a habit on one day. */
export type CompassContribution = {
  linkId: string;
  habitId: string;
  day: IsoDay;
  amount: number;
  unit: ContributionUnit;
  label: string | null;
  /** Whether that day counts as done for the habit. */
  counted: boolean;
};

export type ReviewAnswers = { moved: string; blocked: string; change: string };

export type GoalOutcome = "done" | "carried" | "dropped";

/** A goal as it stands in any quarter, including how it ended. */
export type QuarterGoal = CompassGoal & {
  outcome: GoalOutcome | null;
  /** The goal in the previous quarter this one carried on from. */
  carriedFromGoalId: string | null;
};

/** The quarter rhythm around today: review, planning and the retro. */
export type CompassRhythm = {
  /** Week whose review is open today (Friday → Tuesday), or null. */
  reviewWeek: IsoDay | null;
  review: ReviewAnswers | null;
  planningOpen: boolean;
  next: { quarter: QuarterKey; goalCount: number };
  /** The previous quarter's goals still waiting for a decision, if any. */
  retro: { quarter: QuarterKey; deadline: IsoDay; goals: CompassGoal[] } | null;
};

/** One year at a glance: each quarter's goals and every habit's history. */
export type YearRecord = {
  year: number;
  today: IsoDay;
  weekStart: WeekStart;
  quarters: { quarter: QuarterKey; mode: "past" | "current" | "future"; goals: QuarterGoal[] }[];
  /** Every habit that existed during the year, archived ones included. */
  habits: (CompassHabit & { archivedOn: IsoDay | null })[];
  logs: CompassLog[];
};

export type QuarterRecord = {
  quarter: QuarterKey;
  mode: "past" | "current" | "planning";
  goals: QuarterGoal[];
  retro: string | null;
};

/** Everything Compass shows, as raw rows; the numbers are derived in the browser. */
export type CompassSnapshot = {
  today: IsoDay;
  timezone: string;
  weekStart: WeekStart;
  quarter: QuarterKey;
  goals: CompassGoal[];
  habits: CompassHabit[];
  logs: CompassLog[];
  /** Detail behind automatic ticks; the numbers above already include them. */
  contributions: CompassContribution[];
  rhythm: CompassRhythm;
};

export type GoalInput = z.input<typeof goalInput>;
export type HabitInput = z.input<typeof habitInput>;
export type HabitPatch = z.input<typeof habitPatch>;
export type LogInput = z.input<typeof logInput>;
export type SettingsInput = z.input<typeof settingsInput>;
export type ReviewInput = z.input<typeof reviewInput>;
export type RetroInput = z.input<typeof retroInput>;

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

  /** A past quarter (read-only) or the next one while planning is open. "2026-q3". */
  quarter: (id: string) => http.get<QuarterRecord>(`/api/compass/quarters/${seg(id)}`),
  year: (year: number) => http.get<YearRecord>(`/api/compass/year/${seg(year)}`),
  saveReview: (input: ReviewInput) => http.put<void>("/api/compass/reviews", input),
  closeQuarter: (input: RetroInput) => http.post<void>("/api/compass/retro", input),
};
