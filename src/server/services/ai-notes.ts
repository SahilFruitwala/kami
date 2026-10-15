import "@tanstack/react-start/server-only";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { aiNotes } from "@/lib/schema";

/** Stored AI write-ups (`ai_notes`): one per user, feature and period key. */

export type StoredNote<T> = { key: string; content: T; model: string | null; createdAt: number };

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
  // Keep the newest `keep` of this kind.
  await db.execute(sql`
    delete from ai_notes where user_id = ${userId} and kind = ${kind} and key in (
      select key from ai_notes where user_id = ${userId} and kind = ${kind}
      order by created_at desc offset ${keep}
    )`);
  return { key, content, model, createdAt: createdAt.getTime() };
}

/** One note by its key, or null. */
export async function getNote<T>(
  userId: string,
  kind: string,
  key: string,
): Promise<StoredNote<T> | null> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(aiNotes)
    .where(and(eq(aiNotes.userId, userId), eq(aiNotes.kind, kind), eq(aiNotes.key, key)))
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
