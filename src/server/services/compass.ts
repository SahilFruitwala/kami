import "@tanstack/react-start/server-only";
import { and, asc, eq, gte, inArray, isNull, lt, lte, sql } from "drizzle-orm";
import { z } from "zod";
import type {
  CompassGoal,
  CompassHabit,
  CompassRhythm,
  CompassSnapshot,
  QuarterRecord,
  YearRecord,
} from "@/lib/api/compass";
import {
  goalInput,
  habitInput,
  habitPatch,
  logInput,
  MAX_GOALS,
  MAX_HABITS,
  milestonePatch,
  quarterParams,
  retroInput,
  reviewInput,
  settingsInput,
  type GoalColor,
} from "@/lib/api/schemas/compass";
import {
  addDays,
  daysBetween,
  localDay,
  parseQuarterId,
  quarterId as quarterKeyId,
  quarterOf,
  weekStartOf,
  type IsoDay,
  type QuarterKey,
  type WeekStart,
} from "@/lib/compass/dates";
import {
  BACKDATE_MAX_DAYS,
  EDIT_WINDOW_DAYS,
  canLogDay,
  type HabitSchedule,
  type ScheduleRule,
} from "@/lib/compass/engine";
import {
  nextQuarter,
  planningOpen,
  previousQuarter,
  quarterMode,
  retroDeadline,
  reviewWeek,
} from "@/lib/compass/rhythm";
import { getDb, type AppDb } from "@/lib/db.server";
import { uid } from "@/lib/id";
import {
  compassGoals,
  compassHabitSchedules,
  compassHabits,
  compassLogs,
  compassMilestones,
  compassQuarters,
  compassReviews,
  compassSettings,
  type CompassGoalRow,
  type CompassHabitRow,
  type CompassScheduleRow,
} from "@/lib/schema";
import { badRequest, notFound } from "@/server/http";

/**
 * Compass: quarterly goals with dated milestones, habits (tied to a goal or
 * ongoing) and their daily check-ins. The server stores raw rows and enforces
 * the rules that protect history (the 7-day check-in window, dated schedule
 * changes, archive-not-delete); every number is derived in the browser from
 * the snapshot by `@/lib/compass/engine`.
 */

const id = z.string().min(1).max(200);
export const compassIdParams = z.object({ id });
export {
  goalInput,
  habitInput,
  habitPatch,
  logInput,
  milestonePatch,
  quarterParams,
  retroInput,
  reviewInput,
  settingsInput,
};

/** A habit can be deleted outright only this many days after it was made. */
const DELETE_WINDOW_DAYS = 7;

type Settings = { timezone: string; weekStart: WeekStart };
type Clock = Settings & { today: IsoDay; quarter: QuarterKey };

async function clockFor(db: AppDb, userId: string): Promise<Clock> {
  const [row] = await db
    .select()
    .from(compassSettings)
    .where(eq(compassSettings.userId, userId))
    .limit(1);
  const timezone = row?.timezone ?? "UTC";
  const weekStart: WeekStart = row?.weekStart === 0 ? 0 : 1;
  const today = localDay(timezone);
  return { timezone, weekStart, today, quarter: quarterOf(today, weekStart) };
}

async function quarterRowId(db: AppDb, userId: string, q: QuarterKey): Promise<string> {
  await db
    .insert(compassQuarters)
    .values({ id: uid(), userId, year: q.year, quarter: q.quarter })
    .onConflictDoNothing();
  const [row] = await db
    .select({ id: compassQuarters.id })
    .from(compassQuarters)
    .where(
      and(
        eq(compassQuarters.userId, userId),
        eq(compassQuarters.year, q.year),
        eq(compassQuarters.quarter, q.quarter),
      ),
    )
    .limit(1);
  return row!.id;
}

async function findQuarter(db: AppDb, userId: string, q: QuarterKey) {
  const [row] = await db
    .select()
    .from(compassQuarters)
    .where(
      and(
        eq(compassQuarters.userId, userId),
        eq(compassQuarters.year, q.year),
        eq(compassQuarters.quarter, q.quarter),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function withMilestones(db: AppDb, goalRows: CompassGoalRow[]): Promise<CompassGoal[]> {
  const milestoneRows = goalRows.length
    ? await db
        .select()
        .from(compassMilestones)
        .where(
          inArray(
            compassMilestones.goalId,
            goalRows.map((g) => g.id),
          ),
        )
        .orderBy(asc(compassMilestones.sort))
    : [];
  return goalRows.map((g) => ({
    id: g.id,
    name: g.name,
    why: g.why,
    color: g.color as GoalColor,
    milestones: milestoneRows
      .filter((m) => m.goalId === g.id)
      .map((m) => ({
        id: m.id,
        title: m.title,
        dueOn: m.dueOn,
        weight: m.weight,
        done: !!m.doneAt,
      })),
  }));
}

async function goalsIn(db: AppDb, quarterId: string, live: boolean): Promise<CompassGoalRow[]> {
  return db
    .select()
    .from(compassGoals)
    .where(
      live
        ? and(eq(compassGoals.quarterId, quarterId), isNull(compassGoals.outcome))
        : eq(compassGoals.quarterId, quarterId),
    )
    .orderBy(asc(compassGoals.sort), asc(compassGoals.createdAt));
}

const toSchedule = (row: CompassScheduleRow): HabitSchedule => {
  if (row.rule === "days") return { rule: "days", days: row.days, startsOn: row.startsOn };
  if (row.rule === "per_week")
    return { rule: "per_week", perWeek: row.perWeek ?? 1, startsOn: row.startsOn };
  return { rule: "daily", startsOn: row.startsOn };
};

const scheduleValues = (rule: ScheduleRule) => ({
  rule: rule.rule,
  days: rule.rule === "days" ? rule.days : [],
  perWeek: rule.rule === "per_week" ? rule.perWeek : null,
});

async function ownedGoal(db: AppDb, userId: string, goalId: string) {
  const [row] = await db
    .select()
    .from(compassGoals)
    .where(and(eq(compassGoals.id, goalId), eq(compassGoals.userId, userId)))
    .limit(1);
  if (!row || row.outcome) throw notFound("That goal no longer exists.");
  return row;
}

async function ownedHabit(db: AppDb, userId: string, habitId: string): Promise<CompassHabitRow> {
  const [row] = await db
    .select()
    .from(compassHabits)
    .where(and(eq(compassHabits.id, habitId), eq(compassHabits.userId, userId)))
    .limit(1);
  if (!row || row.archivedAt) throw notFound("That habit no longer exists.");
  return row;
}

// ---------- Read ----------

export async function getCompass(userId: string): Promise<CompassSnapshot> {
  const db = await getDb();
  const clock = await clockFor(db, userId);

  await autoCloseExpired(db, userId, clock);
  const quarter = await findQuarter(db, userId, clock.quarter);
  const goals = quarter ? await withMilestones(db, await goalsIn(db, quarter.id, true)) : [];

  const habitRows = await db
    .select()
    .from(compassHabits)
    .where(and(eq(compassHabits.userId, userId), isNull(compassHabits.archivedAt)))
    .orderBy(asc(compassHabits.sort), asc(compassHabits.createdAt));
  const habitIds = habitRows.map((h) => h.id);
  const scheduleRows = habitIds.length
    ? await db
        .select()
        .from(compassHabitSchedules)
        .where(inArray(compassHabitSchedules.habitId, habitIds))
        .orderBy(asc(compassHabitSchedules.startsOn))
    : [];
  const logRows = habitIds.length
    ? await db
        .select({ habitId: compassLogs.habitId, day: compassLogs.day, value: compassLogs.value })
        .from(compassLogs)
        .where(inArray(compassLogs.habitId, habitIds))
    : [];

  const liveGoals = new Set(goals.map((g) => g.id));
  const habits: CompassHabit[] = habitRows
    .map((h) => ({
      id: h.id,
      // A habit whose goal finished or moved quarters reads as ongoing here.
      goalId: h.goalId && liveGoals.has(h.goalId) ? h.goalId : null,
      name: h.name,
      kind: h.kind,
      target: h.target,
      unit: h.unit,
      createdOn: h.createdOn,
      addedOn: addedOnOf(h, clock),
      pausedOn: h.pausedOn,
      pauses: h.pauses,
      schedules: scheduleRows.filter((s) => s.habitId === h.id).map(toSchedule),
    }))
    .filter((h) => h.schedules.length > 0);

  return {
    today: clock.today,
    timezone: clock.timezone,
    weekStart: clock.weekStart,
    quarter: clock.quarter,
    goals,
    habits,
    logs: logRows,
    rhythm: await rhythmFor(db, userId, clock, quarter?.id ?? null),
  };
}

async function rhythmFor(
  db: AppDb,
  userId: string,
  clock: Clock,
  currentQuarterId: string | null,
): Promise<CompassRhythm> {
  const week = reviewWeek(clock.today, clock.weekStart);
  let review: CompassRhythm["review"] = null;
  if (week && currentQuarterId) {
    const [row] = await db
      .select({ answers: compassReviews.answers })
      .from(compassReviews)
      .where(and(eq(compassReviews.userId, userId), eq(compassReviews.weekStart, week)))
      .limit(1);
    review = row?.answers ?? null;
  }

  const nextQ = nextQuarter(clock.today, clock.weekStart);
  const nextRow = await findQuarter(db, userId, nextQ);
  const nextCount = nextRow ? (await goalsIn(db, nextRow.id, true)).length : 0;

  const prevQ = previousQuarter(clock.today, clock.weekStart);
  const prevRow = await findQuarter(db, userId, prevQ);
  const pending = prevRow ? await goalsIn(db, prevRow.id, true) : [];

  return {
    reviewWeek: week,
    review,
    planningOpen: planningOpen(clock.today, clock.weekStart),
    next: { quarter: nextQ, goalCount: nextCount },
    retro: pending.length
      ? {
          quarter: prevQ,
          deadline: retroDeadline(prevQ, clock.weekStart),
          goals: await withMilestones(db, pending),
        }
      : null,
  };
}

/** Goals left unsorted two weeks after their quarter ended are dropped, and their habits archived. */
async function autoCloseExpired(db: AppDb, userId: string, clock: Clock): Promise<void> {
  const prevQ = previousQuarter(clock.today, clock.weekStart);
  if (clock.today <= retroDeadline(prevQ, clock.weekStart)) return;
  const prevRow = await findQuarter(db, userId, prevQ);
  if (!prevRow || prevRow.status === "closed") return;
  const pending = await goalsIn(db, prevRow.id, true);
  if (pending.length) {
    const ids = pending.map((g) => g.id);
    const now = new Date();
    await db
      .update(compassGoals)
      .set({ outcome: "dropped", updatedAt: now })
      .where(inArray(compassGoals.id, ids));
    await db
      .update(compassHabits)
      .set({ archivedAt: now })
      .where(and(inArray(compassHabits.goalId, ids), isNull(compassHabits.archivedAt)));
  }
  await db
    .update(compassQuarters)
    .set({ status: "closed" })
    .where(eq(compassQuarters.id, prevRow.id));
}

/** A past quarter (read-only) or the next one while planning is open. */
export async function getQuarter(userId: string, id: string): Promise<QuarterRecord> {
  const db = await getDb();
  const clock = await clockFor(db, userId);
  const q = parseQuarterId(id);
  if (!q) throw badRequest("Use a quarter like 2026-q4.");
  const mode = quarterMode(q, clock.today, clock.weekStart);
  if (!mode) throw notFound("That quarter can't be planned yet.");
  const row = await findQuarter(db, userId, q);
  if (!row) return { quarter: q, mode, goals: [], retro: null };
  const rows = await goalsIn(db, row.id, mode !== "past" ? true : false);
  const goals = await withMilestones(db, rows);
  return {
    quarter: q,
    mode,
    retro: row.retro,
    goals: goals.map((g, i) => ({
      ...g,
      outcome: rows[i]!.outcome,
      carriedFromGoalId: rows[i]!.carriedFromGoalId,
    })),
  };
}

// ---------- Settings ----------

export async function updateSettings(
  userId: string,
  input: z.output<typeof settingsInput>,
): Promise<void> {
  const db = await getDb();
  const set = {
    ...(input.timezone ? { timezone: input.timezone } : {}),
    ...(input.weekStart !== undefined ? { weekStart: input.weekStart } : {}),
    updatedAt: new Date(),
  };
  await db
    .insert(compassSettings)
    .values({ userId, ...set })
    .onConflictDoUpdate({ target: compassSettings.userId, set });
}

// ---------- Goals ----------

async function writeMilestones(
  db: AppDb,
  userId: string,
  goalId: string,
  list: z.output<typeof goalInput>["milestones"],
): Promise<void> {
  const existing = await db
    .select({ id: compassMilestones.id })
    .from(compassMilestones)
    .where(eq(compassMilestones.goalId, goalId));
  const known = new Set(existing.map((m) => m.id));
  const keep = new Set(list.flatMap((m) => (m.id && known.has(m.id) ? [m.id] : [])));
  const gone = [...known].filter((x) => !keep.has(x));
  if (gone.length) await db.delete(compassMilestones).where(inArray(compassMilestones.id, gone));

  for (const [sort, m] of list.entries()) {
    const values = { title: m.title, dueOn: m.dueOn ?? null, weight: m.weight, sort };
    if (m.id && keep.has(m.id)) {
      await db.update(compassMilestones).set(values).where(eq(compassMilestones.id, m.id));
    } else {
      await db.insert(compassMilestones).values({ id: uid(), userId, goalId, ...values });
    }
  }
}

export async function createGoal(
  userId: string,
  input: z.output<typeof goalInput>,
): Promise<{ id: string }> {
  const db = await getDb();
  const clock = await clockFor(db, userId);
  if (input.quarter === "next" && !planningOpen(clock.today, clock.weekStart)) {
    throw badRequest("Planning for the next quarter opens two weeks before this one ends.");
  }
  const target =
    input.quarter === "next" ? nextQuarter(clock.today, clock.weekStart) : clock.quarter;
  const quarterId = await quarterRowId(db, userId, target);
  const [count] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(compassGoals)
    .where(and(eq(compassGoals.quarterId, quarterId), isNull(compassGoals.outcome)));
  const n = count?.n ?? 0;
  if (n >= MAX_GOALS) {
    throw badRequest(`A quarter holds up to ${MAX_GOALS} goals. Fewer goals tend to go further.`);
  }
  const goalId = uid();
  await db.insert(compassGoals).values({
    id: goalId,
    userId,
    quarterId,
    name: input.name,
    why: input.why || null,
    color: input.color,
    sort: n,
  });
  await writeMilestones(db, userId, goalId, input.milestones);
  return { id: goalId };
}

export async function updateGoal(
  userId: string,
  goalId: string,
  input: z.output<typeof goalInput>,
): Promise<void> {
  const db = await getDb();
  await ownedGoal(db, userId, goalId);
  await db
    .update(compassGoals)
    .set({ name: input.name, why: input.why || null, color: input.color, updatedAt: new Date() })
    .where(eq(compassGoals.id, goalId));
  await writeMilestones(db, userId, goalId, input.milestones);
}

/** Drop a goal: it leaves the quarter (kept for the year view) and its habits are archived. */
export async function dropGoal(userId: string, goalId: string): Promise<void> {
  const db = await getDb();
  await ownedGoal(db, userId, goalId);
  const now = new Date();
  await db
    .update(compassGoals)
    .set({ outcome: "dropped", updatedAt: now })
    .where(eq(compassGoals.id, goalId));
  await db
    .update(compassHabits)
    .set({ archivedAt: now })
    .where(and(eq(compassHabits.goalId, goalId), isNull(compassHabits.archivedAt)));
}

export async function setMilestone(
  userId: string,
  milestoneId: string,
  input: z.output<typeof milestonePatch>,
): Promise<void> {
  const db = await getDb();
  const [row] = await db
    .update(compassMilestones)
    .set({ doneAt: input.done ? new Date() : null })
    .where(and(eq(compassMilestones.id, milestoneId), eq(compassMilestones.userId, userId)))
    .returning({ id: compassMilestones.id });
  if (!row) throw notFound("That milestone no longer exists.");
}

// ---------- Habits ----------

function habitFields(input: {
  kind?: "check" | "count";
  target?: number | null;
  unit?: string | null;
}) {
  if (input.kind === "check") return { kind: "check" as const, target: null, unit: null };
  return {
    ...(input.kind ? { kind: input.kind } : {}),
    ...(input.target !== undefined ? { target: input.target } : {}),
    ...(input.unit !== undefined ? { unit: input.unit || null } : {}),
  };
}

/** The user's local day a habit row was actually added. */
const addedOnOf = (h: { createdAt: Date }, clock: Clock) => localDay(clock.timezone, h.createdAt);

function checkStart(startedOn: IsoDay, clock: Clock): IsoDay {
  if (startedOn > clock.today) throw badRequest("A habit can't start in the future.");
  if (daysBetween(startedOn, clock.today) > BACKDATE_MAX_DAYS)
    throw badRequest(`A habit can start at most ${BACKDATE_MAX_DAYS / 7} weeks back.`);
  return startedOn;
}

export async function createHabit(
  userId: string,
  input: z.output<typeof habitInput>,
): Promise<{ id: string }> {
  const db = await getDb();
  const clock = await clockFor(db, userId);
  if (input.goalId) await ownedGoal(db, userId, input.goalId);
  const [count] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(compassHabits)
    .where(and(eq(compassHabits.userId, userId), isNull(compassHabits.archivedAt)));
  const n = count?.n ?? 0;
  if (n >= MAX_HABITS)
    throw badRequest(`You can keep up to ${MAX_HABITS} habits. Archive one first.`);

  const startedOn = input.startedOn ? checkStart(input.startedOn, clock) : clock.today;
  const habitId = uid();
  await db.insert(compassHabits).values({
    id: habitId,
    userId,
    goalId: input.goalId,
    name: input.name,
    ...habitFields(input),
    sort: n,
    createdOn: startedOn,
  });
  await db.insert(compassHabitSchedules).values({
    id: uid(),
    habitId,
    startsOn: weekStartOf(startedOn, clock.weekStart),
    ...scheduleValues(input.schedule),
  });
  return { id: habitId };
}

export async function updateHabit(
  userId: string,
  habitId: string,
  patch: z.output<typeof habitPatch>,
): Promise<void> {
  const db = await getDb();
  const clock = await clockFor(db, userId);
  const habit = await ownedHabit(db, userId, habitId);

  if (patch.archived) {
    await db
      .update(compassHabits)
      .set({ archivedAt: new Date() })
      .where(eq(compassHabits.id, habitId));
    return;
  }
  if (patch.goalId) await ownedGoal(db, userId, patch.goalId);
  const kind = patch.kind ?? habit.kind;
  const target = patch.target !== undefined ? patch.target : habit.target;
  if (kind === "count" && !(target && target > 0))
    throw badRequest("Set a daily target for an amount.");

  const set: Partial<CompassHabitRow> = {
    ...(patch.name ? { name: patch.name } : {}),
    ...(patch.goalId !== undefined ? { goalId: patch.goalId } : {}),
    ...habitFields(patch),
  };
  if (patch.startedOn && patch.startedOn !== habit.createdOn) {
    if (daysBetween(addedOnOf(habit, clock), clock.today) >= EDIT_WINDOW_DAYS)
      throw badRequest("The start date can only be changed in a habit's first week.");
    set.createdOn = checkStart(patch.startedOn, clock);
  }
  if (patch.paused === true && !habit.pausedOn) set.pausedOn = clock.today;
  if (patch.paused === false && habit.pausedOn) {
    const to = addDays(clock.today, -1);
    set.pausedOn = null;
    if (to >= habit.pausedOn) set.pauses = [...habit.pauses, { from: habit.pausedOn, to }];
  }
  if (Object.keys(set).length)
    await db.update(compassHabits).set(set).where(eq(compassHabits.id, habitId));

  if (set.createdOn) {
    const start = set.createdOn;
    // Check-ins before the new start no longer count.
    await db
      .delete(compassLogs)
      .where(and(eq(compassLogs.habitId, habitId), lt(compassLogs.day, start)));
    // The first schedule has to cover the new start's week.
    const [first] = await db
      .select()
      .from(compassHabitSchedules)
      .where(eq(compassHabitSchedules.habitId, habitId))
      .orderBy(asc(compassHabitSchedules.startsOn))
      .limit(1);
    const week = weekStartOf(start, clock.weekStart);
    if (first && week < first.startsOn)
      await db
        .update(compassHabitSchedules)
        .set({ startsOn: week })
        .where(eq(compassHabitSchedules.id, first.id));
  }

  if (patch.schedule) {
    // Applies from this week; earlier weeks keep the target they had.
    const startsOn = weekStartOf(clock.today, clock.weekStart);
    const values = scheduleValues(patch.schedule);
    await db
      .insert(compassHabitSchedules)
      .values({ id: uid(), habitId, startsOn, ...values })
      .onConflictDoUpdate({
        target: [compassHabitSchedules.habitId, compassHabitSchedules.startsOn],
        set: values,
      });
  }
}

export async function deleteHabit(userId: string, habitId: string): Promise<void> {
  const db = await getDb();
  const clock = await clockFor(db, userId);
  const habit = await ownedHabit(db, userId, habitId);
  if (daysBetween(addedOnOf(habit, clock), clock.today) >= DELETE_WINDOW_DAYS) {
    throw badRequest("This habit has history now. Archive it instead so its weeks stay intact.");
  }
  await db.delete(compassHabits).where(eq(compassHabits.id, habitId));
}

// ---------- Check-ins ----------

export async function putLog(userId: string, input: z.output<typeof logInput>): Promise<void> {
  const db = await getDb();
  const clock = await clockFor(db, userId);
  const habit = await ownedHabit(db, userId, input.habitId);
  if (input.day < habit.createdOn) throw badRequest("That day is before the habit started.");
  if (
    !canLogDay(
      { createdOn: habit.createdOn, addedOn: addedOnOf(habit, clock) },
      input.day,
      clock.today,
    )
  ) {
    throw badRequest("Check-ins can be changed for today and the 6 days before only.");
  }

  if (input.value === 0) {
    await db
      .delete(compassLogs)
      .where(and(eq(compassLogs.habitId, habit.id), eq(compassLogs.day, input.day)));
    return;
  }
  const value = habit.kind === "check" ? 1 : input.value;
  await db
    .insert(compassLogs)
    .values({ habitId: habit.id, userId, day: input.day, value })
    .onConflictDoUpdate({
      target: [compassLogs.habitId, compassLogs.day],
      set: { value, updatedAt: new Date() },
    });
}

// ---------- Weekly review ----------

export async function saveReview(
  userId: string,
  input: z.output<typeof reviewInput>,
): Promise<void> {
  const db = await getDb();
  const clock = await clockFor(db, userId);
  const week = reviewWeek(clock.today, clock.weekStart);
  if (!week || week !== input.weekStart) {
    throw badRequest("The weekly review is open from Friday to the following Tuesday.");
  }
  const quarterId = await quarterRowId(db, userId, quarterOf(week, clock.weekStart));
  await db
    .insert(compassReviews)
    .values({ id: uid(), userId, quarterId, weekStart: week, answers: input.answers })
    .onConflictDoUpdate({
      target: [compassReviews.quarterId, compassReviews.weekStart],
      set: { answers: input.answers, updatedAt: new Date() },
    });
}

// ---------- Quarter retro ----------

/**
 * Close the previous quarter: each goal is done, carried over or dropped.
 * - Done: the goal keeps its ✓; its habits become ongoing so streaks survive.
 * - Carried: a new goal in this quarter takes its unfinished milestones and habits.
 * - Dropped: the goal ends unfinished and its habits are archived.
 */
export async function closeQuarter(
  userId: string,
  input: z.output<typeof retroInput>,
): Promise<void> {
  const db = await getDb();
  const clock = await clockFor(db, userId);
  const q = parseQuarterId(input.quarter);
  if (!q || quarterKeyId(q) !== quarterKeyId(previousQuarter(clock.today, clock.weekStart))) {
    throw badRequest("Only last quarter can be closed.");
  }
  const prevRow = await findQuarter(db, userId, q);
  if (!prevRow) throw notFound("Nothing to close for that quarter.");
  const pending = new Map((await goalsIn(db, prevRow.id, true)).map((g) => [g.id, g]));
  const currentId = await quarterRowId(db, userId, clock.quarter);
  const now = new Date();
  let sort = (await goalsIn(db, currentId, true)).length;

  for (const d of input.decisions) {
    const goal = pending.get(d.goalId);
    if (!goal) continue;
    await db
      .update(compassGoals)
      .set({ outcome: d.outcome, updatedAt: now })
      .where(eq(compassGoals.id, goal.id));

    if (d.outcome === "dropped") {
      await db
        .update(compassHabits)
        .set({ archivedAt: now })
        .where(and(eq(compassHabits.goalId, goal.id), isNull(compassHabits.archivedAt)));
    } else if (d.outcome === "done") {
      await db
        .update(compassHabits)
        .set({ goalId: null })
        .where(and(eq(compassHabits.goalId, goal.id), isNull(compassHabits.archivedAt)));
    } else {
      const nextId = uid();
      await db.insert(compassGoals).values({
        id: nextId,
        userId,
        quarterId: currentId,
        name: goal.name,
        why: goal.why,
        color: goal.color,
        sort: sort++,
        carriedFromGoalId: goal.id,
      });
      const open = await db
        .select()
        .from(compassMilestones)
        .where(and(eq(compassMilestones.goalId, goal.id), isNull(compassMilestones.doneAt)))
        .orderBy(asc(compassMilestones.sort));
      for (const [i, m] of open.entries()) {
        await db.insert(compassMilestones).values({
          id: uid(),
          userId,
          goalId: nextId,
          title: m.title,
          // Old dates are in the past; set new ones in the new quarter.
          dueOn: null,
          weight: m.weight,
          sort: i,
        });
      }
      await db
        .update(compassHabits)
        .set({ goalId: nextId })
        .where(and(eq(compassHabits.goalId, goal.id), isNull(compassHabits.archivedAt)));
    }
    pending.delete(goal.id);
  }

  await db
    .update(compassQuarters)
    .set({
      ...(input.note !== undefined ? { retro: input.note || null } : {}),
      ...(pending.size === 0 ? { status: "closed" as const } : {}),
    })
    .where(eq(compassQuarters.id, prevRow.id));
}

// ---------- Year ----------

export const yearParams = z.object({ year: z.coerce.number().int().min(2000).max(2100) });

/** Each quarter's goals (with how they ended) and every habit's history for one year. */
export async function getYear(userId: string, year: number): Promise<YearRecord> {
  const db = await getDb();
  const clock = await clockFor(db, userId);
  const cur = clock.quarter.year * 4 + clock.quarter.quarter;

  const quarterRows = await db
    .select()
    .from(compassQuarters)
    .where(and(eq(compassQuarters.userId, userId), eq(compassQuarters.year, year)));
  const quarters: YearRecord["quarters"] = [];
  for (const n of [1, 2, 3, 4] as const) {
    const q = { year, quarter: n };
    const row = quarterRows.find((r) => r.quarter === n);
    const i = year * 4 + n;
    const rows = row ? await goalsIn(db, row.id, false) : [];
    const goals = await withMilestones(db, rows);
    quarters.push({
      quarter: q,
      mode: i < cur ? "past" : i === cur ? "current" : "future",
      goals: goals.map((g, k) => ({
        ...g,
        outcome: rows[k]!.outcome,
        carriedFromGoalId: rows[k]!.carriedFromGoalId,
      })),
    });
  }

  const from = `${year - 1}-12-25`;
  const to = `${year + 1}-01-07`;
  const habitRows = await db
    .select()
    .from(compassHabits)
    .where(and(eq(compassHabits.userId, userId), lte(compassHabits.createdOn, to)))
    .orderBy(asc(compassHabits.sort), asc(compassHabits.createdAt));
  const ids = habitRows.map((h) => h.id);
  const scheduleRows = ids.length
    ? await db
        .select()
        .from(compassHabitSchedules)
        .where(inArray(compassHabitSchedules.habitId, ids))
        .orderBy(asc(compassHabitSchedules.startsOn))
    : [];
  const logs = ids.length
    ? await db
        .select({ habitId: compassLogs.habitId, day: compassLogs.day, value: compassLogs.value })
        .from(compassLogs)
        .where(
          and(
            inArray(compassLogs.habitId, ids),
            gte(compassLogs.day, from),
            lte(compassLogs.day, to),
          ),
        )
    : [];

  const habits = habitRows
    .map((h) => ({
      id: h.id,
      goalId: h.goalId,
      name: h.name,
      kind: h.kind,
      target: h.target,
      unit: h.unit,
      createdOn: h.createdOn,
      addedOn: addedOnOf(h, clock),
      pausedOn: h.pausedOn,
      pauses: h.pauses,
      archivedOn: h.archivedAt ? localDay(clock.timezone, h.archivedAt) : null,
      schedules: scheduleRows.filter((s) => s.habitId === h.id).map(toSchedule),
    }))
    .filter((h) => h.schedules.length > 0 && (!h.archivedOn || h.archivedOn >= `${year}-01-01`));

  return { year, today: clock.today, weekStart: clock.weekStart, quarters, habits, logs };
}
