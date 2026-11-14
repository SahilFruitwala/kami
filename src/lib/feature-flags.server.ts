import "@tanstack/react-start/server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db.server";
import { userFeatureFlags } from "@/lib/schema";

/**
 * Per-user flags on `user_feature_flags`. Missing row = every flag off.
 * The `ai` flag is the operator switch for library AI, the trip agent, and
 * Research; a provider key on the server is still required.
 */

export async function userHasAiFlag(userId: string): Promise<boolean> {
  const db = await getDb();
  const [row] = await db
    .select({ ai: userFeatureFlags.ai })
    .from(userFeatureFlags)
    .where(eq(userFeatureFlags.userId, userId))
    .limit(1);
  return row?.ai === true;
}

/** Insert or update the `ai` flag; leaves `sharing` as it is. */
export async function setUserAiFlag(userId: string, on: boolean): Promise<void> {
  const db = await getDb();
  const now = new Date();
  await db
    .insert(userFeatureFlags)
    .values({ userId, ai: on, sharing: false, updatedAt: now })
    .onConflictDoUpdate({
      target: userFeatureFlags.userId,
      set: { ai: on, updatedAt: now },
    });
}
