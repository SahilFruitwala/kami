import { eq, lt } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { researchModelCache } from "./schema.ts";

/**
 * Research's model answer cache in Postgres, keyed by
 * `modelCacheKey(model chain, prompt version, input)`. Not per user: a hit
 * needs the identical input, so it only ever returns the answer to that same
 * question. Kept free of app path aliases so tests/db can drive it.
 */

type Db = NodePgDatabase<any>;

/** How long a cached answer is kept. */
export const MODEL_CACHE_DAYS = 30;

export async function cachedAnswer(db: Db, key: string): Promise<unknown | null> {
  const [row] = await db
    .select({ output: researchModelCache.output })
    .from(researchModelCache)
    .where(eq(researchModelCache.key, key));
  return row ? row.output : null;
}

export async function storeAnswer(
  db: Db,
  entry: { key: string; model: string; output: unknown; tokensIn: number; tokensOut: number },
): Promise<void> {
  await db.insert(researchModelCache).values(entry).onConflictDoNothing();
}

/** Drop answers older than `days`; called when a run ends. Returns how many went. */
export async function pruneModelCache(db: Db, days = MODEL_CACHE_DAYS): Promise<number> {
  const cutoff = new Date(Date.now() - days * 86_400_000);
  const rows = await db
    .delete(researchModelCache)
    .where(lt(researchModelCache.createdAt, cutoff))
    .returning({ key: researchModelCache.key });
  return rows.length;
}
