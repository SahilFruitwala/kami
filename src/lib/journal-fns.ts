import { and, desc, eq, sql } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { CacheTTL, cacheKey, cached, invalidateUserCache } from "@/lib/cache.server.ts";
import { getDb } from "@/lib/db";
import { JOURNAL_TEXT_MAX, type JournalEntry } from "@/lib/journal";
import { journalEntries } from "@/lib/schema";
import { uid } from "@/lib/store";

export const JOURNAL_IMPORT_MAX = 2000;

const dateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const entrySchema = z.object({
  date: dateKeySchema,
  text: z.string().max(JOURNAL_TEXT_MAX).default(""),
  updatedAt: z.number().int().nonnegative(),
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

export const getJournalEntries = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<JournalEntry[]> => {
    return loadEntries(context.userId);
  });

export const upsertJournalEntry = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => entrySchema.parse(input))
  .handler(async ({ context, data }): Promise<JournalEntry> => {
    const entry = await upsertOwnedEntry(context.userId, data);
    await invalidateUserCache(context.userId);
    return entry;
  });

export const importJournalSnapshot = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    z
      .object({
        entries: z.array(entrySchema).max(JOURNAL_IMPORT_MAX),
      })
      .parse(input),
  )
  .handler(async ({ context, data }): Promise<JournalEntry[]> => {
    for (const entry of data.entries) {
      await upsertOwnedEntry(context.userId, entry);
    }
    await invalidateUserCache(context.userId);
    return loadEntries(context.userId);
  });
