import "@tanstack/react-start/server-only";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { aiNotes } from "@/lib/schema";

/** Stored AI write-ups (`ai_notes`): one per user, feature and period key. */

export type StoredNote<T> = { key: string; content: T; model: string | null; createdAt: number };

/** The newest note of a kind (any key), or null. */
export async function latestNote<T>(userId: string, kind: string): Promise<StoredNote<T> | null> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(aiNotes)
    .where(and(eq(aiNotes.userId, userId), eq(aiNotes.kind, kind)))
    .orderBy(desc(aiNotes.createdAt))
    .limit(1);
  return row
    ? {
        key: row.key,
        content: row.content as T,
        model: row.model,
        createdAt: row.createdAt.getTime(),
      }
    : null;
}

/** Save (or replace) a note, keeping the newest `keep` of its kind. */
export async function saveNote<T>(
  userId: string,
  kind: string,
  key: string,
  content: T,
  model: string | null,
  keep = 12,
): Promise<StoredNote<T>> {
  const db = await getDb();
  const createdAt = new Date();
  await db
    .insert(aiNotes)
    .values({ userId, kind, key, content, model, createdAt })
    .onConflictDoUpdate({
      target: [aiNotes.userId, aiNotes.kind, aiNotes.key],
      set: { content, model, createdAt },
    });
  const stale = await db
    .select({ key: aiNotes.key })
    .from(aiNotes)
    .where(and(eq(aiNotes.userId, userId), eq(aiNotes.kind, kind)))
    .orderBy(desc(aiNotes.createdAt))
    .offset(keep);
  for (const row of stale) {
    await db
      .delete(aiNotes)
      .where(and(eq(aiNotes.userId, userId), eq(aiNotes.kind, kind), eq(aiNotes.key, row.key)));
  }
  return { key, content, model, createdAt: createdAt.getTime() };
}
