import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { nameKey, type PlayerAudience, type PlayerPricing } from "./research/players.ts";
import { researchEvidence, researchPlayerEvidence, researchPlayers } from "./schema.ts";

/**
 * Research players in Postgres: creating a player once per name, linking the
 * evidence that names it, the next player to fill in, and the table the
 * Players tab shows. Kept free of app path aliases so tests/db can drive it.
 */

type Db = NodePgDatabase<any>;

export type PlayerRow = typeof researchPlayers.$inferSelect;

/**
 * Create a player for each name in the given evidence (once per `name_key`)
 * and link the evidence to it. Returns how many players are new.
 */
export async function notePlayers(
  db: Db,
  topic: { userId: string; topicId: string },
  evidence: Array<{ id: string; names: string[] }>,
): Promise<number> {
  const byKey = new Map<string, { name: string; evidenceIds: string[] }>();
  for (const e of evidence) {
    for (const name of e.names) {
      const key = nameKey(name);
      if (!key) continue;
      const entry = byKey.get(key) ?? { name, evidenceIds: [] };
      if (!entry.evidenceIds.includes(e.id)) entry.evidenceIds.push(e.id);
      byKey.set(key, entry);
    }
  }
  if (!byKey.size) return 0;

  const created = await db
    .insert(researchPlayers)
    .values(
      [...byKey.entries()].map(([key, v]) => ({
        id: randomUUID(),
        userId: topic.userId,
        topicId: topic.topicId,
        name: v.name.slice(0, 80),
        nameKey: key,
      })),
    )
    .onConflictDoNothing({ target: [researchPlayers.topicId, researchPlayers.nameKey] })
    .returning({ id: researchPlayers.id });

  const rows = await db
    .select({ id: researchPlayers.id, nameKey: researchPlayers.nameKey })
    .from(researchPlayers)
    .where(
      and(
        eq(researchPlayers.topicId, topic.topicId),
        inArray(researchPlayers.nameKey, [...byKey.keys()]),
      ),
    );
  const links = rows.flatMap((p) =>
    (byKey.get(p.nameKey)?.evidenceIds ?? []).map((evidenceId) => ({
      playerId: p.id,
      evidenceId,
    })),
  );
  if (links.length) await db.insert(researchPlayerEvidence).values(links).onConflictDoNothing();
  return created.length;
}

/** Players still to look up, best-known first (most evidence), capped. */
export async function playersToFill(db: Db, topicId: string, limit: number): Promise<PlayerRow[]> {
  const rows = await db
    .select({
      player: researchPlayers,
      mentions: sql<number>`count(${researchPlayerEvidence.evidenceId})::int`,
    })
    .from(researchPlayers)
    .leftJoin(researchPlayerEvidence, eq(researchPlayerEvidence.playerId, researchPlayers.id))
    .where(and(eq(researchPlayers.topicId, topicId), isNull(researchPlayers.filledAt)))
    .groupBy(researchPlayers.id)
    .orderBy(sql`count(${researchPlayerEvidence.evidenceId}) desc`, asc(researchPlayers.createdAt))
    .limit(limit);
  return rows.map((r) => r.player);
}

export async function unfilledPlayerCount(db: Db, topicId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(researchPlayers)
    .where(and(eq(researchPlayers.topicId, topicId), isNull(researchPlayers.filledAt)));
  return row?.n ?? 0;
}

export type PlayerFill = {
  url: string | null;
  category: string | null;
  oneLiner: string | null;
  audience: PlayerAudience | null;
  pricing: PlayerPricing | null;
  freePlan: boolean | null;
  sourceIds: string[];
};

/** Record what was found for a player (nothing found is still recorded, so it is not retried). */
export async function savePlayerFill(db: Db, playerId: string, fill: PlayerFill): Promise<void> {
  await db
    .update(researchPlayers)
    .set({ ...fill, filledAt: new Date(), updatedAt: new Date() })
    .where(eq(researchPlayers.id, playerId));
}

/** Categories the topic already uses, so new players reuse them. */
export async function playerCategories(db: Db, topicId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ category: researchPlayers.category })
    .from(researchPlayers)
    .where(eq(researchPlayers.topicId, topicId));
  return rows.map((r) => r.category).filter((c): c is string => Boolean(c));
}

export type PlayerListRow = PlayerRow & { mentions: number; complaints: number };

/** A topic's players with how many quotes name them and how many of those are negative. */
export async function topicPlayers(db: Db, topicId: string): Promise<PlayerListRow[]> {
  const rows = await db
    .select({
      player: researchPlayers,
      mentions: sql<number>`count(${researchEvidence.id})::int`,
      complaints: sql<number>`count(${researchEvidence.id}) filter (where ${researchEvidence.sentiment} < 0)::int`,
    })
    .from(researchPlayers)
    .leftJoin(researchPlayerEvidence, eq(researchPlayerEvidence.playerId, researchPlayers.id))
    .leftJoin(researchEvidence, eq(researchEvidence.id, researchPlayerEvidence.evidenceId))
    .where(eq(researchPlayers.topicId, topicId))
    .groupBy(researchPlayers.id);
  return rows.map((r) => ({ ...r.player, mentions: r.mentions, complaints: r.complaints }));
}

/** Remember a player's site as soon as it is found, so a resumed fill doesn't search again. */
export async function setPlayerUrl(db: Db, playerId: string, url: string): Promise<void> {
  await db
    .update(researchPlayers)
    .set({ url, updatedAt: new Date() })
    .where(eq(researchPlayers.id, playerId));
}
