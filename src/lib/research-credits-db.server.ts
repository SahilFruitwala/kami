import { randomUUID } from "node:crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { ResearchCreditKind } from "./research/kinds.ts";
import { canReserveCredits, unspentCredits, type ResearchCreditEntry } from "./research/credits.ts";
import { researchCreditEntries, researchRuns } from "./schema.ts";

/**
 * The research credit ledger in Postgres, with the same locking as the
 * narration allowance (src/lib/allowance-db.server.ts). Kept free of app
 * path aliases so tests/db can drive it against a real database.
 */

type Db = NodePgDatabase<any>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export class ResearchCreditsShortError extends Error {
  readonly needed: number;
  readonly available: number;

  constructor(needed: number, available: number) {
    super(`Not enough research credits: needs ${needed}, ${available} available.`);
    this.name = "ResearchCreditsShortError";
    this.needed = needed;
    this.available = available;
  }
}

/** Serialise credit changes per user for the rest of the transaction. */
async function lockUser(tx: Tx, userId: string) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`research-credits:${userId}`}, 0))`,
  );
}

async function balance(tx: Tx | Db, userId: string): Promise<number> {
  const [row] = await tx
    .select({ total: sql<number>`coalesce(sum(${researchCreditEntries.credits}), 0)::int` })
    .from(researchCreditEntries)
    .where(eq(researchCreditEntries.userId, userId));
  return Number(row?.total ?? 0);
}

async function insertEntry(
  tx: Tx | Db,
  userId: string,
  kind: ResearchCreditKind,
  credits: number,
  note: string,
  runId: string | null,
) {
  await tx.insert(researchCreditEntries).values({
    id: randomUUID(),
    userId,
    kind,
    credits,
    note: note.slice(0, 200),
    runId,
  });
}

/** Credits this user can still spend on new runs. */
export async function researchCreditBalance(db: Db, userId: string): Promise<number> {
  return balance(db, userId);
}

/** The operator adds credits (positive) or takes them back (negative). */
export async function grantResearchCredits(db: Db, userId: string, credits: number, note: string) {
  if (!Number.isInteger(credits) || credits === 0) {
    throw new Error("Grant must be a non-zero integer.");
  }
  await db.transaction(async (tx) => {
    await lockUser(tx, userId);
    await insertEntry(tx, userId, "grant", credits, note, null);
  });
}

/**
 * Set aside a run's whole budget and record it on the run. Concurrent
 * reservations for one user are serialised, so two runs can never overspend.
 * Pass `tx` to make it part of a larger transaction (e.g. moving the run to
 * `queued`); otherwise it runs in its own.
 */
export async function reserveRunCredits(
  db: Db,
  userId: string,
  runId: string,
  budget: number,
  note: string,
  tx?: Tx,
): Promise<void> {
  const run = async (t: Tx) => {
    await lockUser(t, userId);
    const available = await balance(t, userId);
    if (!canReserveCredits(available, budget)) {
      throw new ResearchCreditsShortError(budget, available);
    }
    await insertEntry(t, userId, "reserve", -budget, note, runId);
    await t
      .update(researchRuns)
      .set({ budgetCredits: budget })
      .where(and(eq(researchRuns.id, runId), eq(researchRuns.userId, userId)));
  };
  if (tx) await run(tx);
  else await db.transaction(run);
}

/**
 * End a run's hold on the ledger: record what it was charged and return the
 * unspent part of its budget. Safe to call more than once; only the first
 * call (while `charged_credits` is still null) does anything. Returns the
 * charge, or null when the run was already settled or isn't the user's.
 */
export async function settleRunCredits(
  db: Db,
  userId: string,
  runId: string,
  charged: number,
  note: string,
): Promise<number | null> {
  return db.transaction(async (tx) => {
    await lockUser(tx, userId);
    const [run] = await tx
      .update(researchRuns)
      // Capped at the budget: a run never owes more than it reserved.
      .set({
        chargedCredits: sql`least(${Math.max(0, Math.round(charged))}, ${researchRuns.budgetCredits})`,
      })
      .where(
        and(
          eq(researchRuns.id, runId),
          eq(researchRuns.userId, userId),
          isNull(researchRuns.chargedCredits),
        ),
      )
      .returning({ budget: researchRuns.budgetCredits, charged: researchRuns.chargedCredits });
    if (!run) return null;
    const back = unspentCredits(run.budget, run.charged ?? 0);
    if (back > 0) await insertEntry(tx, userId, "release", back, note, runId);
    return run.charged ?? 0;
  });
}

/** The newest ledger rows, for the credits panel. */
export async function recentResearchCreditEntries(
  db: Db,
  userId: string,
  limit = 20,
): Promise<ResearchCreditEntry[]> {
  const rows = await db
    .select()
    .from(researchCreditEntries)
    .where(eq(researchCreditEntries.userId, userId))
    .orderBy(desc(researchCreditEntries.createdAt), desc(researchCreditEntries.id))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    credits: r.credits,
    note: r.note,
    runId: r.runId,
    createdAt: r.createdAt.getTime(),
  }));
}
