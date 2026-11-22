import "@tanstack/react-start/server-only";
import { and, eq, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import type { LinkEvent, LinkOutcome, ReadingLink } from "@/lib/api/reading-links";
import {
  contributionInput,
  linkIdParams,
  linkInput,
  linkPatch,
  linkQuery,
} from "@/lib/api/schemas/reading-links";
import { addDays } from "@/lib/compass/dates";
import { readingCounts, readingDelta, type BookPosition } from "@/lib/compass/reading";
import { getDb, type AppDb } from "@/lib/db.server";
import { uid } from "@/lib/id";
import {
  compassHabits,
  compassLogContributions,
  compassLogs,
  entityLinks,
  type CompassHabitRow,
} from "@/lib/schema";
import { findOwnedItem } from "@/lib/shelves-db.server";
import { badRequest, notFound } from "@/server/http";
import { clockFor } from "@/server/services/compass";

export { contributionInput, linkIdParams, linkInput, linkPatch, linkQuery };

/**
 * Links from reading to Compass habits. Always opt-in: with no link a book
 * update does nothing here. A link's mode decides what an update does:
 * `auto` counts it and offers Undo, `ask` offers it and waits, `off` is quiet.
 * What a link adds is kept in `compass_log_contributions`, apart from the
 * habit's own check-ins, so a manual tick and an automatic one never collide.
 */

type LinkRow = typeof entityLinks.$inferSelect;
const toLink = (r: LinkRow): ReadingLink => ({
  id: r.id,
  sourceType: "book",
  sourceId: r.sourceId,
  habitId: r.targetId,
  mode: r.mode,
});

async function activeCheckHabit(
  db: AppDb,
  userId: string,
  habitId: string,
): Promise<CompassHabitRow> {
  const [habit] = await db
    .select()
    .from(compassHabits)
    .where(and(eq(compassHabits.id, habitId), eq(compassHabits.userId, userId)))
    .limit(1);
  if (!habit || habit.archivedAt) throw notFound("That habit no longer exists.");
  if (habit.kind !== "check") {
    throw badRequest("Reading can only be linked to a done / not-done habit for now.");
  }
  return habit;
}

async function ownedLink(db: AppDb, userId: string, id: string): Promise<LinkRow> {
  const [row] = await db
    .select()
    .from(entityLinks)
    .where(and(eq(entityLinks.id, id), eq(entityLinks.userId, userId)))
    .limit(1);
  if (!row) throw notFound("That link no longer exists.");
  return row;
}

export async function listLinks(
  userId: string,
  q: z.output<typeof linkQuery>,
): Promise<ReadingLink[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(entityLinks)
    .where(
      and(
        eq(entityLinks.userId, userId),
        eq(entityLinks.sourceType, q.sourceType),
        eq(entityLinks.sourceId, q.sourceId),
        eq(entityLinks.targetType, "habit"),
      ),
    );
  return rows.map(toLink);
}

export async function createLink(
  userId: string,
  input: z.output<typeof linkInput>,
): Promise<ReadingLink> {
  const db = await getDb();
  if (!(await findOwnedItem(userId, "book", input.sourceId))) throw notFound("Book not found.");
  await activeCheckHabit(db, userId, input.habitId);

  const [row] = await db
    .insert(entityLinks)
    .values({
      id: uid(),
      userId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      targetType: "habit",
      targetId: input.habitId,
      mode: input.mode,
    })
    .onConflictDoUpdate({
      target: [
        entityLinks.userId,
        entityLinks.sourceType,
        entityLinks.sourceId,
        entityLinks.targetType,
        entityLinks.targetId,
      ],
      set: { mode: input.mode },
    })
    .returning();
  return toLink(row);
}

export async function updateLink(
  userId: string,
  id: string,
  patch: z.output<typeof linkPatch>,
): Promise<ReadingLink> {
  const db = await getDb();
  await ownedLink(db, userId, id);
  const [row] = await db
    .update(entityLinks)
    .set({ mode: patch.mode })
    .where(eq(entityLinks.id, id))
    .returning();
  return toLink(row);
}

/** Removes the link. Days it already ticked stay, so streaks don't change under you. */
export async function deleteLink(userId: string, id: string): Promise<void> {
  const db = await getDb();
  await ownedLink(db, userId, id);
  await db.delete(entityLinks).where(eq(entityLinks.id, id));
}

type DayState = { counted: boolean };

/**
 * Add `delta` to a link's reading on `day` (negative takes it back). Returns
 * whether the link counted the day before and after, so callers can tell a
 * fresh tick from more reading on a day that was already done.
 */
async function addReading(
  db: AppDb,
  link: LinkRow,
  habitId: string,
  day: string,
  delta: number,
  unit: "pages" | "percent",
  label: string,
): Promise<{ before: DayState; after: DayState }> {
  const [existing] = await db
    .select()
    .from(compassLogContributions)
    .where(and(eq(compassLogContributions.linkId, link.id), eq(compassLogContributions.day, day)))
    .limit(1);

  // Pages and percent don't add up; a change of unit starts the day over.
  const base = existing && existing.unit === unit ? existing.amount : 0;
  const amount = Math.max(0, base + delta);
  const before = { counted: existing?.counted ?? false };

  if (amount === 0) {
    if (existing) {
      await db
        .delete(compassLogContributions)
        .where(
          and(eq(compassLogContributions.linkId, link.id), eq(compassLogContributions.day, day)),
        );
    }
    return { before, after: { counted: false } };
  }

  const counted = readingCounts(amount, unit, link.threshold);
  await db
    .insert(compassLogContributions)
    .values({
      linkId: link.id,
      habitId,
      userId: link.userId,
      day,
      amount,
      unit,
      label,
      counted,
    })
    .onConflictDoUpdate({
      target: [compassLogContributions.linkId, compassLogContributions.day],
      set: { amount, unit, label, counted, updatedAt: new Date() },
    });
  return { before, after: { counted } };
}

/** "Log it" and "Undo": add or take back reading on a recent day. */
export async function applyContribution(
  userId: string,
  linkId: string,
  input: z.output<typeof contributionInput>,
): Promise<void> {
  const db = await getDb();
  const link = await ownedLink(db, userId, linkId);
  const habit = await activeCheckHabit(db, userId, link.targetId);
  const { today } = await clockFor(db, userId);
  if (input.day > today || input.day < addDays(today, -6) || input.day < habit.createdOn) {
    throw badRequest("Reading can be changed for today and the 6 days before only.");
  }
  const book = await findOwnedItem(userId, "book", link.sourceId);
  await addReading(db, link, habit.id, input.day, input.delta, input.unit, book?.title ?? "A book");
}

/**
 * Called after a book's progress is saved. Applies `auto` links and returns
 * what `ask` links could do. Never throws into the save: the book update has
 * already succeeded, so a failure here only means no link prompt this time.
 */
export async function onBookProgress(
  userId: string,
  book: { id: string; title: string },
  before: BookPosition,
  after: BookPosition,
): Promise<LinkOutcome> {
  const none: LinkOutcome = { applied: [], suggestions: [] };
  try {
    const change = readingDelta(before, after);
    if (!change) return none;

    const db = await getDb();
    const links = await db
      .select()
      .from(entityLinks)
      .where(
        and(
          eq(entityLinks.userId, userId),
          eq(entityLinks.sourceType, "book"),
          eq(entityLinks.sourceId, book.id),
          eq(entityLinks.targetType, "habit"),
          ne(entityLinks.mode, "off"),
        ),
      );
    if (links.length === 0) return none;

    const { today } = await clockFor(db, userId);
    const out: LinkOutcome = { applied: [], suggestions: [] };

    for (const link of links) {
      const [habit] = await db
        .select()
        .from(compassHabits)
        .where(and(eq(compassHabits.id, link.targetId), isNull(compassHabits.archivedAt)))
        .limit(1);
      if (!habit || habit.kind !== "check" || today < habit.createdOn) continue;

      const [manual] = await db
        .select({ day: compassLogs.day })
        .from(compassLogs)
        .where(and(eq(compassLogs.habitId, habit.id), eq(compassLogs.day, today)))
        .limit(1);
      const event: LinkEvent = {
        linkId: link.id,
        habitId: habit.id,
        habitName: habit.name,
        day: today,
        delta: change.delta,
        unit: change.unit,
        label: book.title,
      };

      if (link.mode === "auto") {
        const r = await addReading(
          db,
          link,
          habit.id,
          today,
          change.delta,
          change.unit,
          book.title,
        );
        // Only a new tick is worth a toast, and only when it wasn't already ticked by hand.
        if (!manual && !r.before.counted && r.after.counted) out.applied.push(event);
      } else if (change.delta > 0 && !manual) {
        const [done] = await db
          .select({ day: compassLogContributions.day })
          .from(compassLogContributions)
          .where(
            and(
              eq(compassLogContributions.habitId, habit.id),
              eq(compassLogContributions.day, today),
              eq(compassLogContributions.counted, true),
            ),
          )
          .limit(1);
        if (!done) out.suggestions.push(event);
      }
    }
    return out;
  } catch (err) {
    console.error("[reading-links] onBookProgress failed", err);
    return none;
  }
}
