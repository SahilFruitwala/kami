import "@tanstack/react-start/server-only";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { CompassGoal, CompassHabit, CompassSnapshot } from "@/lib/api/compass";
import {
  goalInput,
  habitInput,
  habitPatch,
  logInput,
  MAX_GOALS,
  MAX_HABITS,
  milestonePatch,
  settingsInput,
  type GoalColor,
} from "@/lib/api/schemas/compass";
import {
  addDays,
  daysBetween,
  localDay,
  quarterOf,
  weekStartOf,
  type IsoDay,
  type QuarterKey,
  type WeekStart,
} from "@/lib/compass/dates";
import { canEditDay, type HabitSchedule, type ScheduleRule } from "@/lib/compass/engine";
import { getDb, type AppDb } from "@/lib/db.server";
import { uid } from "@/lib/id";
import {
  compassGoals,
  compassHabitSchedules,
  compassHabits,
  compassLogs,
  compassMilestones,
  compassQuarters,
  compassSettings,
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
export { goalInput, habitInput, habitPatch, logInput, milestonePatch, settingsInput };

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

  const [quarter] = await db
    .select({ id: compassQuarters.id })
    .from(compassQuarters)
    .where(
      and(
        eq(compassQuarters.userId, userId),
        eq(compassQuarters.year, clock.quarter.year),
        eq(compassQuarters.quarter, clock.quarter.quarter),
      ),
    )
    .limit(1);

  const goalRows = quarter
    ? await db
        .select()
        .from(compassGoals)
        .where(and(eq(compassGoals.quarterId, quarter.id), isNull(compassGoals.outcome)))
        .orderBy(asc(compassGoals.sort), asc(compassGoals.createdAt))
    : [];
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

  const liveGoals = new Set(goalRows.map((g) => g.id));
  const goals: CompassGoal[] = goalRows.map((g) => ({
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
  const quarterId = await quarterRowId(db, userId, clock.quarter);
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

  const habitId = uid();
  await db.insert(compassHabits).values({
    id: habitId,
    userId,
    goalId: input.goalId,
    name: input.name,
    ...habitFields(input),
    sort: n,
    createdOn: clock.today,
  });
  await db.insert(compassHabitSchedules).values({
    id: uid(),
    habitId,
    startsOn: weekStartOf(clock.today, clock.weekStart),
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
  if (patch.paused === true && !habit.pausedOn) set.pausedOn = clock.today;
  if (patch.paused === false && habit.pausedOn) {
    const to = addDays(clock.today, -1);
    set.pausedOn = null;
    if (to >= habit.pausedOn) set.pauses = [...habit.pauses, { from: habit.pausedOn, to }];
  }
  if (Object.keys(set).length)
    await db.update(compassHabits).set(set).where(eq(compassHabits.id, habitId));

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
  if (daysBetween(habit.createdOn, clock.today) >= DELETE_WINDOW_DAYS) {
    throw badRequest("This habit has history now. Archive it instead so its weeks stay intact.");
  }
  await db.delete(compassHabits).where(eq(compassHabits.id, habitId));
}

// ---------- Check-ins ----------

export async function putLog(userId: string, input: z.output<typeof logInput>): Promise<void> {
  const db = await getDb();
  const clock = await clockFor(db, userId);
  const habit = await ownedHabit(db, userId, input.habitId);
  if (!canEditDay(input.day, clock.today)) {
    throw badRequest("Check-ins can be changed for today and the 6 days before only.");
  }
  if (input.day < habit.createdOn) throw badRequest("That day is before the habit started.");

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
