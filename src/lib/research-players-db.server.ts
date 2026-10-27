import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { EMPTY_PRICING, nameKey, type PlayerPricing } from "./research/players.ts";
import { researchEvidence, researchPlayerEvidence, researchPlayers } from "./schema.ts";

/**
 * Research players in Postgres. Deduped per topic by name_key; owner-scoped
 * reads. Evidence names upsert stubs; Explore fills fields from fetched pages.
 */

type Db = NodePgDatabase<any>;

export type PlayerRow = typeof researchPlayers.$inferSelect;

export async function upsertPlayerFromName(
  db: Db,
  row: { userId: string; topicId: string; name: string },
): Promise<PlayerRow | null> {
  const key = nameKey(row.name);
  if (!key) return null;
  const name = row.name.replace(/\s+/g, " ").trim().slice(0, 80);
  const [saved] = await db
    .insert(researchPlayers)
    .values({
      id: randomUUID(),
      userId: row.userId,
      topicId: row.topicId,
      name,
      nameKey: key,
      pricing: EMPTY_PRICING,
    })
    .onConflictDoNothing({ target: [researchPlayers.topicId, researchPlayers.nameKey] })
    .returning();
  if (saved) return saved;
  const [existing] = await db
    .select()
    .from(researchPlayers)
    .where(and(eq(researchPlayers.topicId, row.topicId), eq(researchPlayers.nameKey, key)));
  return existing ?? null;
}

export async function linkPlayerEvidence(
  db: Db,
  playerId: string,
  evidenceId: string,
): Promise<void> {
  await db
    .insert(researchPlayerEvidence)
    .values({ playerId, evidenceId })
    .onConflictDoNothing();
}

/** Turn named products on new evidence into Players (stubs) and link the quotes. */
export async function syncPlayersFromEvidence(
  db: Db,
  userId: string,
  topicId: string,
  rows: Array<{ id: string; names: string[] }>,
): Promise<number> {
  const seen = new Set<string>();
  let created = 0;
  for (const row of rows) {
    for (const name of row.names ?? []) {
      const key = nameKey(name);
      if (!key || seen.has(`${row.id}:${key}`)) continue;
      seen.add(`${row.id}:${key}`);
      const before = await db
        .select({ id: researchPlayers.id })
        .from(researchPlayers)
        .where(and(eq(researchPlayers.topicId, topicId), eq(researchPlayers.nameKey, key)));
      const player = await upsertPlayerFromName(db, { userId, topicId, name });
      if (!player) continue;
      if (!before.length) created++;
      await linkPlayerEvidence(db, player.id, row.id);
    }
  }
  return created;
}

export async function listTopicPlayers(db: Db, userId: string, topicId: string): Promise<PlayerRow[]> {
  return db
    .select()
    .from(researchPlayers)
    .where(and(eq(researchPlayers.topicId, topicId), eq(researchPlayers.userId, userId)))
    .orderBy(researchPlayers.category, researchPlayers.name);
}

export async function getOwnPlayer(
  db: Db,
  userId: string,
  playerId: string,
): Promise<PlayerRow | null> {
  const [row] = await db
    .select()
    .from(researchPlayers)
    .where(and(eq(researchPlayers.id, playerId), eq(researchPlayers.userId, userId)));
  return row ?? null;
}

export async function playerEvidenceIds(
  db: Db,
  playerIds: string[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (!playerIds.length) return map;
  const rows = await db
    .select()
    .from(researchPlayerEvidence)
    .where(inArray(researchPlayerEvidence.playerId, playerIds));
  for (const row of rows) {
    const list = map.get(row.playerId) ?? [];
    list.push(row.evidenceId);
    map.set(row.playerId, list);
  }
  return map;
}

export async function playerEvidenceStats(
  db: Db,
  playerIds: string[],
): Promise<Map<string, { evidenceCount: number; complaints: number }>> {
  const map = new Map<string, { evidenceCount: number; complaints: number }>();
  if (!playerIds.length) return map;
  const rows = await db
    .select({
      playerId: researchPlayerEvidence.playerId,
      kind: researchEvidence.kind,
      sentiment: researchEvidence.sentiment,
    })
    .from(researchPlayerEvidence)
    .innerJoin(researchEvidence, eq(researchEvidence.id, researchPlayerEvidence.evidenceId))
    .where(inArray(researchPlayerEvidence.playerId, playerIds));
  for (const row of rows) {
    const cur = map.get(row.playerId) ?? { evidenceCount: 0, complaints: 0 };
    cur.evidenceCount++;
    if (row.kind === "pain" || row.kind === "competitor" || row.sentiment < 0) cur.complaints++;
    map.set(row.playerId, cur);
  }
  return map;
}

export async function unfilledPlayers(db: Db, topicId: string): Promise<PlayerRow[]> {
  return db
    .select()
    .from(researchPlayers)
    .where(
      and(
        eq(researchPlayers.topicId, topicId),
        sql`cardinality(${researchPlayers.sourceIds}) = 0`,
      ),
    )
    .orderBy(researchPlayers.createdAt, researchPlayers.id);
}

export async function updatePlayerFill(
  db: Db,
  playerId: string,
  patch: {
    url?: string;
    category: string;
    oneLiner: string;
    audience: string;
    pricing: PlayerPricing;
    freePlan: boolean;
    sourceIds: string[];
  },
): Promise<void> {
  await db
    .update(researchPlayers)
    .set({
      ...(patch.url ? { url: patch.url } : {}),
      category: patch.category,
      oneLiner: patch.oneLiner,
      audience: patch.audience,
      pricing: patch.pricing,
      freePlan: patch.freePlan,
      sourceIds: patch.sourceIds,
      updatedAt: new Date(),
    })
    .where(eq(researchPlayers.id, playerId));
}

export async function setPlayerUrl(db: Db, playerId: string, url: string): Promise<void> {
  await db
    .update(researchPlayers)
    .set({ url, updatedAt: new Date() })
    .where(eq(researchPlayers.id, playerId));
}

export async function countTopicPlayers(db: Db, topicId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(researchPlayers)
    .where(eq(researchPlayers.topicId, topicId));
  return Number(row?.n ?? 0);
}
