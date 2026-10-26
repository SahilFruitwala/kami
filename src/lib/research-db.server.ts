import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type {
  Depth,
  DiscoverInput,
  RunKind,
  SearchHit,
  SourceKind,
  SourceOrigin,
} from "./research/kinds.ts";
import {
  researchIdeas,
  researchQueries,
  researchRuns,
  researchSources,
  researchTopicSources,
  researchTopics,
} from "./schema.ts";

/**
 * Research rows in Postgres: topics, runs, sent queries and the source cache. Every read
 * and write is scoped to its owner, so a wrong id is simply "not found".
 * Kept free of app path aliases so tests/db can drive it against a real
 * database. Credits live in their own module (ticket 02); evidence and ideas
 * are written by the engine steps that own them.
 */

type Db = NodePgDatabase<any>;

export type TopicRow = typeof researchTopics.$inferSelect;
export type RunRow = typeof researchRuns.$inferSelect;
export type SourceRow = typeof researchSources.$inferSelect;

/** Topic names come from a seed or question, so they are trimmed and capped. */
export const TOPIC_NAME_MAX = 80;

export function topicName(raw: string): string {
  const name = raw.replace(/\s+/g, " ").trim().slice(0, TOPIC_NAME_MAX).trim();
  return name || "Untitled topic";
}

// ---------- Topics ----------

export type TopicSummary = TopicRow & { liveIdeas: number; lastRunAt: Date | null };

/** The user's topics, newest activity first, with live idea counts and the last run. */
export async function listTopics(db: Db, userId: string): Promise<TopicSummary[]> {
  // Drizzle renders columns unqualified here, so the outer topic id is spelled
  // out: a bare "id" inside the subqueries would mean the inner table's.
  const rows = await db
    .select({
      topic: researchTopics,
      liveIdeas: sql<number>`(
        select count(*)::int from research_ideas i
        where i.topic_id = "research_topics"."id" and i.status in ('open', 'starred')
      )`,
      lastRunAt: sql<string | null>`(
        select max(r.created_at) from research_runs r
        where r.topic_id = "research_topics"."id"
      )`,
    })
    .from(researchTopics)
    .where(eq(researchTopics.userId, userId))
    .orderBy(desc(researchTopics.updatedAt));
  return rows.map((r) => ({
    ...r.topic,
    liveIdeas: Number(r.liveIdeas),
    lastRunAt: r.lastRunAt ? new Date(r.lastRunAt) : null,
  }));
}

export async function getTopic(db: Db, userId: string, topicId: string): Promise<TopicRow | null> {
  const [row] = await db
    .select()
    .from(researchTopics)
    .where(and(eq(researchTopics.id, topicId), eq(researchTopics.userId, userId)));
  return row ?? null;
}

export async function createTopic(db: Db, userId: string, name: string): Promise<TopicRow> {
  const [row] = await db
    .insert(researchTopics)
    .values({ id: randomUUID(), userId, name: topicName(name) })
    .returning();
  return row;
}

/** Returns false when the topic isn't the user's. */
export async function renameTopic(
  db: Db,
  userId: string,
  topicId: string,
  name: string,
): Promise<boolean> {
  const rows = await db
    .update(researchTopics)
    .set({ name: topicName(name), updatedAt: new Date() })
    .where(and(eq(researchTopics.id, topicId), eq(researchTopics.userId, userId)))
    .returning({ id: researchTopics.id });
  return rows.length > 0;
}

/** Marks new activity in a topic (a run finished), so it sorts first. */
export async function touchTopic(db: Db, userId: string, topicId: string): Promise<void> {
  await db
    .update(researchTopics)
    .set({ updatedAt: new Date() })
    .where(and(eq(researchTopics.id, topicId), eq(researchTopics.userId, userId)));
}

/**
 * Deletes the topic and everything in it (runs, queries, evidence, ideas).
 * Cached sources stay for the user's other topics. Returns false when the
 * topic isn't the user's.
 */
export async function deleteTopic(db: Db, userId: string, topicId: string): Promise<boolean> {
  const rows = await db
    .delete(researchTopics)
    .where(and(eq(researchTopics.id, topicId), eq(researchTopics.userId, userId)))
    .returning({ id: researchTopics.id });
  return rows.length > 0;
}

// ---------- Runs ----------

/** A new run in `drafting`; its plan is drafted next. */
export async function createRun(
  db: Db,
  userId: string,
  topicId: string,
  run: { kind: RunKind; depth: Depth; input: DiscoverInput },
): Promise<RunRow> {
  const [row] = await db
    .insert(researchRuns)
    .values({ id: randomUUID(), userId, topicId, state: "drafting", ...run })
    .returning();
  return row;
}

export async function getRun(db: Db, userId: string, runId: string): Promise<RunRow | null> {
  const [row] = await db
    .select()
    .from(researchRuns)
    .where(and(eq(researchRuns.id, runId), eq(researchRuns.userId, userId)));
  return row ?? null;
}

/** A topic's runs, newest first. */
export async function listRuns(
  db: Db,
  userId: string,
  topicId: string,
  limit = 20,
): Promise<RunRow[]> {
  return db
    .select()
    .from(researchRuns)
    .where(and(eq(researchRuns.topicId, topicId), eq(researchRuns.userId, userId)))
    .orderBy(desc(researchRuns.createdAt))
    .limit(limit);
}

// ---------- Sources ----------

/** Cached copies of these pages, keyed by `url_key`. */
export async function sourcesByUrlKey(
  db: Db,
  userId: string,
  urlKeys: string[],
): Promise<Map<string, SourceRow>> {
  if (urlKeys.length === 0) return new Map();
  const rows = await db
    .select()
    .from(researchSources)
    .where(and(eq(researchSources.userId, userId), inArray(researchSources.urlKey, urlKeys)));
  return new Map(rows.map((r) => [r.urlKey, r]));
}

export type SourceInput = {
  url: string;
  urlKey: string;
  site: string;
  kind: SourceKind;
  title: string;
  markdown: string;
  contentHash: string;
  publishedAt: Date | null;
  addedBy: SourceOrigin;
};

/**
 * Store a freshly fetched page, replacing an older copy of the same
 * `url_key` in place (its id, and so its evidence, stay). A page first found
 * by search and later pasted keeps `added_by = search`.
 */
export async function upsertSource(db: Db, userId: string, page: SourceInput): Promise<SourceRow> {
  const [row] = await db
    .insert(researchSources)
    .values({ id: randomUUID(), userId, ...page, fetchedAt: new Date() })
    .onConflictDoUpdate({
      target: [researchSources.userId, researchSources.urlKey],
      set: {
        url: page.url,
        site: page.site,
        kind: page.kind,
        title: page.title,
        markdown: page.markdown,
        contentHash: page.contentHash,
        publishedAt: page.publishedAt,
        fetchedAt: new Date(),
      },
    })
    .returning();
  return row;
}

/** Record that a topic used a source; a no-op when it already has. */
export async function linkTopicSource(
  db: Db,
  topicId: string,
  sourceId: string,
  runId: string | null,
): Promise<void> {
  await db
    .insert(researchTopicSources)
    .values({ topicId, sourceId, firstRunId: runId })
    .onConflictDoNothing();
}

/** `url_key`s the topic already has, so a run can skip results it has read. */
export async function topicUrlKeys(db: Db, userId: string, topicId: string): Promise<Set<string>> {
  const rows = await db
    .select({ urlKey: researchSources.urlKey })
    .from(researchTopicSources)
    .innerJoin(researchSources, eq(researchSources.id, researchTopicSources.sourceId))
    .where(and(eq(researchTopicSources.topicId, topicId), eq(researchSources.userId, userId)));
  return new Set(rows.map((r) => r.urlKey));
}

// ---------- Queries ----------

/** Every query this topic has sent, normalised, so a new plan can flag repeats. */
export async function topicQueryNorms(db: Db, topicId: string): Promise<Set<string>> {
  const rows = await db
    .selectDistinct({ norm: researchQueries.queryNorm })
    .from(researchQueries)
    .where(eq(researchQueries.topicId, topicId));
  return new Set(rows.map((r) => r.norm));
}

/** The topic's latest distinct queries, newest first, for the plan prompt. */
export async function recentTopicQueries(db: Db, topicId: string, limit = 50): Promise<string[]> {
  const rows = await db
    .select({ norm: researchQueries.queryNorm, at: sql<Date>`max(${researchQueries.createdAt})` })
    .from(researchQueries)
    .where(eq(researchQueries.topicId, topicId))
    .groupBy(researchQueries.queryNorm)
    .orderBy(desc(sql`max(${researchQueries.createdAt})`))
    .limit(limit);
  return rows.map((r) => r.norm);
}

/** Record a sent query with what it found. */
export async function insertRunQuery(
  db: Db,
  row: { userId: string; topicId: string; runId: string; queryNorm: string; hits: SearchHit[] },
): Promise<void> {
  await db.insert(researchQueries).values({ id: randomUUID(), ...row, results: row.hits.length });
}

/** A run's sent queries in the order they were sent, with their results. */
export async function runQueries(
  db: Db,
  runId: string,
): Promise<Array<{ queryNorm: string; hits: SearchHit[] }>> {
  return db
    .select({ queryNorm: researchQueries.queryNorm, hits: researchQueries.hits })
    .from(researchQueries)
    .where(eq(researchQueries.runId, runId))
    .orderBy(researchQueries.createdAt, researchQueries.id);
}

// ---------- Ideas ----------

/** Titles of the topic's live ideas (open and starred), best first, for the plan prompt. */
export async function liveIdeaTitles(db: Db, topicId: string, limit = 50): Promise<string[]> {
  const rows = await db
    .select({ title: researchIdeas.title })
    .from(researchIdeas)
    .where(
      and(eq(researchIdeas.topicId, topicId), inArray(researchIdeas.status, ["open", "starred"])),
    )
    .orderBy(desc(researchIdeas.scoreTotal))
    .limit(limit);
  return rows.map((r) => r.title);
}
