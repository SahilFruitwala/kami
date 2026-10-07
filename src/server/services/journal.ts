import "@tanstack/react-start/server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { JOURNAL_IMPORT_MAX } from "@/lib/api/types";
import { CacheTTL, cacheKey, cached, invalidateUserCache } from "@/lib/cache.server.ts";
import { getDb } from "@/lib/db";
import { JOURNAL_TEXT_MAX, type JournalEntry } from "@/lib/journal";
import { journalEntries } from "@/lib/schema";
import { uid } from "@/lib/store";

export const dateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date.");

const entrySchema = z.object({
  date: dateKeySchema,
  text: z.string().max(JOURNAL_TEXT_MAX).default(""),
  updatedAt: z.number().int().nonnegative(),
});

/** `PUT /api/journal/:date` body — the date lives in the path. */
export const entryBody = entrySchema.omit({ date: true });

export const importBody = z.object({
  entries: z.array(entrySchema).max(JOURNAL_IMPORT_MAX),
});

function rowToEntry(row: typeof journalEntries.$inferSelect): JournalEntry {
  return {
    date: row.date,
    text: row.text,
    updatedAt: row.updatedAt.getTime(),
  };
}

async function loadEntries(userId: string): Promise<JournalEntry[]> {
  // Journal boots refetch the whole history; entries change rarely, so a
  // short per-user entry absorbs remount bursts. Writes invalidate it.
  return cached(cacheKey("u", userId, "journal", "entries"), CacheTTL.journal, async () => {
    const db = await getDb();
    const rows = await db
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.userId, userId))
      .orderBy(desc(journalEntries.date));
    return rows.map(rowToEntry);
  });
}

async function upsertOwnedEntry(
  userId: string,
  data: { date: string; text: string; updatedAt: number },
): Promise<JournalEntry> {
  const db = await getDb();
  const text = data.text.slice(0, JOURNAL_TEXT_MAX);
  const incomingAt = new Date(data.updatedAt);
  const existing = await db
    .select()
    .from(journalEntries)
    .where(and(eq(journalEntries.userId, userId), eq(journalEntries.date, data.date)))
    .limit(1);

  if (!existing[0]) {
    await db.insert(journalEntries).values({
      id: uid(),
      userId,
      date: data.date,
      text,
      updatedAt: incomingAt,
    });
    return { date: data.date, text, updatedAt: data.updatedAt };
  }

  if (existing[0].updatedAt.getTime() > data.updatedAt) {
    return rowToEntry(existing[0]);
  }

  await db
    .update(journalEntries)
    .set({ text, updatedAt: incomingAt })
    .where(
      and(
        eq(journalEntries.id, existing[0].id),
        eq(journalEntries.userId, userId),
        sql`${journalEntries.updatedAt} <= ${incomingAt}`,
      ),
    );

  const next = await db
    .select()
    .from(journalEntries)
    .where(and(eq(journalEntries.userId, userId), eq(journalEntries.date, data.date)))
    .limit(1);
  return next[0] ? rowToEntry(next[0]) : { date: data.date, text, updatedAt: data.updatedAt };
}

export async function listJournalEntries(userId: string): Promise<JournalEntry[]> {
  return loadEntries(userId);
}

export async function upsertJournalEntry(
  userId: string,
  data: z.output<typeof entrySchema>,
): Promise<JournalEntry> {
  const entry = await upsertOwnedEntry(userId, data);
  await invalidateUserCache(userId);
  return entry;
}

export async function importJournalEntries(
  userId: string,
  data: z.output<typeof importBody>,
): Promise<JournalEntry[]> {
  for (const entry of data.entries) {
    await upsertOwnedEntry(userId, entry);
  }
  await invalidateUserCache(userId);
  return loadEntries(userId);
}
