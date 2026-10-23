import { randomUUID } from "node:crypto";
import { desc, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { canReserve, type AllowanceEntry, type AllowanceKind } from "./allowance.ts";
import { allowanceEntries } from "./schema.ts";

/**
 * The narration allowance ledger in Postgres. Kept free of app path aliases
 * so scripts/allowance-db.test.mjs can drive it against a real database.
 */

type Db = NodePgDatabase<any>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export class AllowanceShortError extends Error {
  readonly needed: number;
  readonly available: number;

  constructor(needed: number, available: number) {
    super(`Narration allowance too low: needs ${needed}, ${available} available.`);
    this.name = "AllowanceShortError";
    this.needed = needed;
    this.available = available;
  }
}

/** Serialise allowance changes per user for the rest of the transaction. */
async function lockUser(tx: Tx, userId: string) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`allowance:${userId}`}, 0))`,
  );
}

async function balance(tx: Tx | Db, userId: string): Promise<number> {
  const [row] = await tx
    .select({ total: sql<number>`coalesce(sum(${allowanceEntries.chars}), 0)::int` })
    .from(allowanceEntries)
    .where(eq(allowanceEntries.userId, userId));
  return Number(row?.total ?? 0);
}

async function insertEntry(
  tx: Tx | Db,
  userId: string,
  kind: AllowanceKind,
  chars: number,
  note: string,
  narrationId: string | null,
) {
  await tx.insert(allowanceEntries).values({
    id: randomUUID(),
    userId,
    kind,
    chars,
    note: note.slice(0, 200),
    narrationId,
  });
}

/** Characters this user can still spend on new narrations. */
export async function allowanceBalance(db: Db, userId: string): Promise<number> {
  return balance(db, userId);
}

/** The operator adds allowance (positive) or takes it back (negative). */
export async function grantAllowance(db: Db, userId: string, chars: number, note: string) {
  if (!Number.isInteger(chars) || chars === 0) throw new Error("Grant must be a non-zero integer.");
  await db.transaction(async (tx) => {
    await lockUser(tx, userId);
    await insertEntry(tx, userId, "grant", chars, note, null);
  });
}

/**
 * Set aside `chars` for a narration. Concurrent reservations for one user
 * are serialised, so two narrations can never overspend the allowance.
 * Pass `tx` to make the reservation part of a larger transaction (e.g.
 * creating the narration row); otherwise it runs in its own.
 */
export async function reserveAllowance(
  db: Db,
  userId: string,
  chars: number,
  narrationId: string,
  note: string,
  tx?: Tx,
): Promise<void> {
  const run = async (t: Tx) => {
    await lockUser(t, userId);
    const available = await balance(t, userId);
    if (!canReserve(available, chars)) throw new AllowanceShortError(chars, available);
    await insertEntry(t, userId, "reserve", -chars, note, narrationId);
  };
  if (tx) await run(tx);
  else await db.transaction(run);
}

/** Return the unspoken part of a reservation (an unfinished narration was deleted). */
export async function releaseAllowance(
  db: Db,
  userId: string,
  chars: number,
  narrationId: string,
  note: string,
  tx?: Tx,
): Promise<void> {
  if (chars <= 0) return;
  const run = async (t: Tx) => {
    await lockUser(t, userId);
    await insertEntry(t, userId, "release", chars, note, narrationId);
  };
  if (tx) await run(tx);
  else await db.transaction(run);
}

/** The newest ledger rows, for the Listening card. */
export async function recentAllowanceEntries(
  db: Db,
  userId: string,
  limit = 20,
): Promise<AllowanceEntry[]> {
  const rows = await db
    .select()
    .from(allowanceEntries)
    .where(eq(allowanceEntries.userId, userId))
    .orderBy(desc(allowanceEntries.createdAt), desc(allowanceEntries.id))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind as AllowanceKind,
    chars: r.chars,
    note: r.note,
    narrationId: r.narrationId,
    createdAt: r.createdAt.getTime(),
  }));
}
