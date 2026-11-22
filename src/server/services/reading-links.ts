import "@tanstack/react-start/server-only";
import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import type {
  HabitLinkEvent,
  LinkOutcome,
  LinkSuggestion,
  MilestoneLinkEvent,
  ReadingLink,
} from "@/lib/api/reading-links";
import {
  completeInput,
  contributionInput,
  linkIdParams,
  linkInput,
  linkPatch,
  linkQuery,
  suggestionQuery,
} from "@/lib/api/schemas/reading-links";
import { addDays } from "@/lib/compass/dates";
import {
  readingCounts,
  readingDelta,
  suggestFromFinished,
  type BookPosition,
} from "@/lib/compass/reading";
import { getDb, type AppDb } from "@/lib/db.server";
import { uid } from "@/lib/id";
import {
  books,
  compassGoals,
  compassHabits,
  compassLogContributions,
  compassLogs,
  compassMilestones,
  entityLinks,
  folders,
  type CompassHabitRow,
} from "@/lib/schema";
import { findOwnedItem } from "@/lib/shelves-db.server";
import { badRequest, notFound } from "@/server/http";
import { clockFor } from "@/server/services/compass";

export {
  completeInput,
  contributionInput,
  linkIdParams,
  linkInput,
  linkPatch,
  linkQuery,
  suggestionQuery,
};

/**
 * Links from reading to Compass. Always opt-in: with no link, reading does
 * nothing here. A link's mode decides what happens: `auto` counts it and
 * offers Undo, `ask` offers it and waits, `off` is quiet.
 *
 * - A book feeds a done / not-done habit as its progress moves, and a
 *   milestone when it is finished.
 * - A saved-post folder feeds a habit when an article in it is archived. The
 *   library saves offline-first, so there is nowhere to ask: folder links tick
 *   automatically or not at all.
 *
 * What a link adds to a habit is kept in `compass_log_contributions`, apart
 * from the habit's own check-ins, so a manual tick and an automatic one never
 * collide.
 */

type LinkRow = typeof entityLinks.$inferSelect;
const toLink = (
  r: LinkRow,
  source: { title: string; status: string | null } | null = null,
): ReadingLink => ({
  id: r.id,
  sourceType: r.sourceType === "folder" ? "folder" : "book",
  sourceId: r.sourceId,
  sourceTitle: source?.title ?? null,
  sourceStatus: source?.status ?? null,
  targetType: r.targetType,
  targetId: r.targetId,
  mode: r.mode,
});

/** A milestone of a goal that is still in play and not yet done. */
async function openMilestone(db: AppDb, userId: string, milestoneId: string) {
  const [m] = await db
    .select({
      id: compassMilestones.id,
      title: compassMilestones.title,
      doneAt: compassMilestones.doneAt,
      outcome: compassGoals.outcome,
    })
    .from(compassMilestones)
    .innerJoin(compassGoals, eq(compassGoals.id, compassMilestones.goalId))
    .where(and(eq(compassMilestones.id, milestoneId), eq(compassMilestones.userId, userId)))
    .limit(1);
  if (!m || m.outcome) throw notFound("That milestone no longer exists.");
  return m;
}

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
  const where = [eq(entityLinks.userId, userId)];
  if (q.sourceType && q.sourceId) {
    where.push(eq(entityLinks.sourceType, q.sourceType), eq(entityLinks.sourceId, q.sourceId));
  } else {
    where.push(
      eq(entityLinks.targetType, q.targetType ?? "habit"),
      eq(entityLinks.targetId, q.targetId ?? ""),
    );
  }

  const rows = await db
    .select()
    .from(entityLinks)
    .where(and(...where));
  const ids = (type: string) => rows.filter((r) => r.sourceType === type).map((r) => r.sourceId);
  const bookIds = ids("book");
  const folderIds = ids("folder");
  // Titles come only from sources this user's own links point at.
  const bookRows = bookIds.length
    ? await db
        .select({ id: books.id, title: books.title, status: books.status })
        .from(books)
        .where(inArray(books.id, bookIds))
    : [];
  const folderRows = folderIds.length
    ? await db
        .select({ id: folders.id, name: folders.name })
        .from(folders)
        .where(and(eq(folders.userId, userId), inArray(folders.id, folderIds)))
    : [];
  const sourceOf = new Map<string, { title: string; status: string | null }>([
    ...bookRows.map((b) => [b.id, { title: b.title, status: b.status }] as const),
    ...folderRows.map((f) => [f.id, { title: f.name, status: null }] as const),
  ]);
  return rows.map((r) => toLink(r, sourceOf.get(r.sourceId) ?? null));
}

/**
 * Habits a finished book fed, offered for a book that is being read now. Only
 * a suggestion: the reader decides whether to link. Nothing is offered for a
 * book that is not in progress, or for a habit it is already linked to.
 */
export async function suggestLinks(
  userId: string,
  q: z.output<typeof suggestionQuery>,
): Promise<LinkSuggestion[]> {
  const book = await findOwnedItem(userId, "book", q.bookId);
  if (!book || book.status !== "in_progress") return [];

  const db = await getDb();
  const mine = await db
    .select({ habitId: entityLinks.targetId, mode: entityLinks.mode, bookId: entityLinks.sourceId })
    .from(entityLinks)
    .where(
      and(
        eq(entityLinks.userId, userId),
        eq(entityLinks.sourceType, "book"),
        eq(entityLinks.targetType, "habit"),
        ne(entityLinks.mode, "off"),
      ),
    );
  const linked = new Set(mine.filter((l) => l.bookId === q.bookId).map((l) => l.habitId));
  const candidates = mine.filter((l) => l.bookId !== q.bookId && !linked.has(l.habitId));
  if (candidates.length === 0) return [];

  const finished = await db
    .select({ id: books.id, title: books.title, completedAt: books.completedAt })
    .from(books)
    .where(
      and(
        inArray(
          books.id,
          candidates.map((c) => c.bookId),
        ),
        eq(books.status, "done"),
      ),
    );
  const picks = suggestFromFinished(
    candidates.flatMap((c) => (c.mode === "off" ? [] : [{ ...c, mode: c.mode }])),
    finished.map((b) => ({
      id: b.id,
      title: b.title,
      completedAt: b.completedAt?.getTime() ?? null,
    })),
  );
  if (picks.length === 0) return [];

  const habits = await db
    .select({ id: compassHabits.id, name: compassHabits.name, kind: compassHabits.kind })
    .from(compassHabits)
    .where(
      and(
        eq(compassHabits.userId, userId),
        isNull(compassHabits.archivedAt),
        inArray(
          compassHabits.id,
          picks.map((p) => p.habitId),
        ),
      ),
    );
  const nameOf = new Map(habits.filter((h) => h.kind === "check").map((h) => [h.id, h.name]));
  return picks.flatMap((p) => {
    const habitName = nameOf.get(p.habitId);
    return habitName ? [{ ...p, habitName }] : [];
  });
}

export async function createLink(
  userId: string,
  input: z.output<typeof linkInput>,
): Promise<ReadingLink> {
  const db = await getDb();

  if (input.sourceType === "book") {
    if (!(await findOwnedItem(userId, "book", input.sourceId))) throw notFound("Book not found.");
  } else {
    const [folder] = await db
      .select({ id: folders.id })
      .from(folders)
      .where(and(eq(folders.id, input.sourceId), eq(folders.userId, userId)))
      .limit(1);
    if (!folder) throw notFound("Folder not found.");
    if (input.targetType !== "habit") {
      throw badRequest("A saved-post folder can only count toward a habit.");
    }
    if (input.mode === "ask") {
      throw badRequest("A saved-post folder ticks the habit automatically, or not at all.");
    }
  }

  if (input.targetType === "habit") {
    await activeCheckHabit(db, userId, input.targetId);
  } else {
    const m = await openMilestone(db, userId, input.targetId);
    if (m.doneAt) throw badRequest("That milestone is already done.");
  }

  const [row] = await db
    .insert(entityLinks)
    .values({
      id: uid(),
      userId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      targetType: input.targetType,
      targetId: input.targetId,
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
  const link = await ownedLink(db, userId, id);
  if (link.sourceType === "folder" && patch.mode === "ask") {
    throw badRequest("A saved-post folder ticks the habit automatically, or not at all.");
  }
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
  unit: "pages" | "percent" | "articles",
  label: string,
): Promise<{ before: DayState; after: DayState }> {
  const [existing] = await db
    .select()
    .from(compassLogContributions)
    .where(and(eq(compassLogContributions.linkId, link.id), eq(compassLogContributions.day, day)))
    .limit(1);

  // Pages, percent and articles don't add up; a change of unit starts the day over.
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
  if (link.targetType !== "habit" || link.sourceType !== "book") {
    throw badRequest("That link doesn't count reading toward a habit.");
  }
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
      const event: HabitLinkEvent = {
        kind: "habit",
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

/**
 * Called when a book becomes finished (its progress reaches the end, or it is
 * marked read). Completes the milestones it is linked to (`auto`) or offers to
 * (`ask`). Like `onBookProgress`, it never throws into the save that triggered it.
 */
export async function onBookFinished(
  userId: string,
  book: { id: string; title: string },
): Promise<LinkOutcome> {
  const out: LinkOutcome = { applied: [], suggestions: [] };
  try {
    const db = await getDb();
    const links = await db
      .select()
      .from(entityLinks)
      .where(
        and(
          eq(entityLinks.userId, userId),
          eq(entityLinks.sourceType, "book"),
          eq(entityLinks.sourceId, book.id),
          eq(entityLinks.targetType, "milestone"),
          ne(entityLinks.mode, "off"),
        ),
      );
    for (const link of links) {
      const m = await openMilestone(db, userId, link.targetId).catch(() => null);
      // A milestone already done, or of a goal that has ended, has nothing to offer.
      if (!m || m.doneAt) continue;
      const event: MilestoneLinkEvent = {
        kind: "milestone",
        linkId: link.id,
        milestoneId: m.id,
        milestoneTitle: m.title,
        label: book.title,
      };
      if (link.mode === "auto") {
        await db
          .update(compassMilestones)
          .set({ doneAt: new Date() })
          .where(and(eq(compassMilestones.id, m.id), eq(compassMilestones.userId, userId)));
        out.applied.push(event);
      } else {
        out.suggestions.push(event);
      }
    }
    return out;
  } catch (err) {
    console.error("[reading-links] onBookFinished failed", err);
    return { applied: [], suggestions: [] };
  }
}

/** "Yes" and "Undo" for a linked milestone: mark it done, or take that back. */
export async function completeLinkedMilestone(
  userId: string,
  linkId: string,
  input: z.output<typeof completeInput>,
): Promise<void> {
  const db = await getDb();
  const link = await ownedLink(db, userId, linkId);
  if (link.targetType !== "milestone") {
    throw badRequest("That link doesn't count toward a milestone.");
  }
  await openMilestone(db, userId, link.targetId);
  await db
    .update(compassMilestones)
    .set({ doneAt: input.done ? new Date() : null })
    .where(and(eq(compassMilestones.id, link.targetId), eq(compassMilestones.userId, userId)));
}

/**
 * Called when an article is archived (or put back). Counts it toward habits
 * linked to the article's folder: +1 on today, taken back if it is unarchived
 * the same day. Never throws into the save that triggered it.
 */
export async function onArticleArchived(
  userId: string,
  article: { folderId: string | null },
  archived: boolean,
): Promise<void> {
  if (!article.folderId) return;
  try {
    const db = await getDb();
    const links = await db
      .select()
      .from(entityLinks)
      .where(
        and(
          eq(entityLinks.userId, userId),
          eq(entityLinks.sourceType, "folder"),
          eq(entityLinks.sourceId, article.folderId),
          eq(entityLinks.targetType, "habit"),
          eq(entityLinks.mode, "auto"),
        ),
      );
    if (links.length === 0) return;

    const [folder] = await db
      .select({ name: folders.name })
      .from(folders)
      .where(and(eq(folders.id, article.folderId), eq(folders.userId, userId)))
      .limit(1);
    const { today } = await clockFor(db, userId);
    for (const link of links) {
      const [habit] = await db
        .select()
        .from(compassHabits)
        .where(and(eq(compassHabits.id, link.targetId), isNull(compassHabits.archivedAt)))
        .limit(1);
      if (!habit || habit.kind !== "check" || today < habit.createdOn) continue;
      await addReading(
        db,
        link,
        habit.id,
        today,
        archived ? 1 : -1,
        "articles",
        folder?.name ?? "Saved posts",
      );
    }
  } catch (err) {
    console.error("[reading-links] onArticleArchived failed", err);
  }
}
