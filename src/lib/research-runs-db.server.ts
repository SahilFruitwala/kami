import { and, eq, inArray, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { RunSpend } from "./research/credits.ts";
import type { RunProgress } from "./research/kinds.ts";
import { ACTIVE_RUN_STATES } from "./research/run-engine.ts";
import type { RunRow } from "./research-db.server.ts";
import { researchRuns } from "./schema.ts";

/**
 * Run rows as the background loop sees them: claiming under a lease,
 * writing only while the lease is ours, and counting spend. Kept free of
 * app path aliases so tests/db can drive it against a real database.
 * Owner-scoped reads live in research-db.server.ts.
 */

type Db = NodePgDatabase<any>;

/**
 * Claim an active run for this invocation: only when its lease is free,
 * expired or already ours. A queued run becomes running. Null when another
 * invocation holds it or it isn't active.
 */
export async function claimRun(
  db: Db,
  runId: string,
  lease: string,
  leaseMs: number,
): Promise<RunRow | null> {
  const now = new Date();
  const [row] = await db
    .update(researchRuns)
    .set({
      runLease: lease,
      leaseUntil: new Date(now.getTime() + leaseMs),
      state: "running",
      startedAt: sql`coalesce(${researchRuns.startedAt}, now())`,
    })
    .where(
      and(
        eq(researchRuns.id, runId),
        inArray(researchRuns.state, [...ACTIVE_RUN_STATES]),
        sql`(${researchRuns.leaseUntil} is null or ${researchRuns.leaseUntil} < now() or ${researchRuns.runLease} = ${lease})`,
      ),
    )
    .returning();
  return row ?? null;
}

export type RunPatch = Partial<
  Pick<
    typeof researchRuns.$inferInsert,
    "state" | "step" | "stopReason" | "error" | "leaseUntil" | "runLease" | "finishedAt"
  >
>;

/** Write to a run we hold the lease on; null when the lease was lost or the run is gone. */
export async function updateLeasedRun(
  db: Db,
  runId: string,
  lease: string,
  patch: RunPatch,
): Promise<RunRow | null> {
  const [row] = await db
    .update(researchRuns)
    .set(patch)
    .where(and(eq(researchRuns.id, runId), eq(researchRuns.runLease, lease)))
    .returning();
  return row ?? null;
}

/** Add to a run's counted spend (never subtracts). Null when the lease was lost. */
export async function addRunSpend(
  db: Db,
  runId: string,
  lease: string,
  spend: Partial<RunSpend>,
): Promise<RunRow | null> {
  const add = (n: number | undefined) => Math.max(0, Math.round(n ?? 0));
  const [row] = await db
    .update(researchRuns)
    .set({
      firecrawlCredits: sql`${researchRuns.firecrawlCredits} + ${add(spend.firecrawlCredits)}`,
      tokensIn: sql`${researchRuns.tokensIn} + ${add(spend.tokensIn)}`,
      tokensOut: sql`${researchRuns.tokensOut} + ${add(spend.tokensOut)}`,
    })
    .where(and(eq(researchRuns.id, runId), eq(researchRuns.runLease, lease)))
    .returning();
  return row ?? null;
}

/**
 * Merge counters into a run's progress. Not lease-checked on purpose: the
 * Stop button sets `stopRequested` here while the run holds its lease.
 */
export async function mergeRunProgress(
  db: Db,
  runId: string,
  patch: RunProgress,
): Promise<RunRow | null> {
  const [row] = await db
    .update(researchRuns)
    .set({ progress: sql`${researchRuns.progress} || ${JSON.stringify(patch)}::jsonb` })
    .where(eq(researchRuns.id, runId))
    .returning();
  return row ?? null;
}

export async function getRunById(db: Db, runId: string): Promise<RunRow | null> {
  const [row] = await db.select().from(researchRuns).where(eq(researchRuns.id, runId));
  return row ?? null;
}
