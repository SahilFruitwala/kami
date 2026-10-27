import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { IdeaScore } from "./research/kinds.ts";
import { IDEA_EVIDENCE_KINDS } from "./research/kinds.ts";
import type { ScoredEvidence } from "./research/score.ts";
import {
  researchEvidence,
  researchIdeaEvidence,
  researchIdeas,
  researchRuns,
  researchSources,
  researchTopicSources,
} from "./schema.ts";

/**
 * Research ideas in Postgres: the lists a matcher sees, creating ideas,
 * attaching evidence, and rescoring. Kept free of app path aliases so
 * tests/db can drive it against a real database.
 */

type Db = NodePgDatabase<any>;

export type IdeaRow = typeof researchIdeas.$inferSelect;
export type IdeaBrief = { id: string; title: string; summary: string };

/** The topic's open and starred ideas, best first, for matching. */
export async function liveIdeasForMatching(
  db: Db,
  topicId: string,
  limit: number,
): Promise<IdeaBrief[]> {
  return db
    .select({ id: researchIdeas.id, title: researchIdeas.title, summary: researchIdeas.summary })
    .from(researchIdeas)
    .where(
      and(eq(researchIdeas.topicId, topicId), inArray(researchIdeas.status, ["open", "starred"])),
    )
    .orderBy(desc(researchIdeas.scoreTotal), asc(researchIdeas.createdAt))
    .limit(limit);
}

/** The topic's dismissed ideas, so matching quotes attach to them instead of reviving them. */
export async function dismissedIdeasForMatching(
  db: Db,
  topicId: string,
  limit: number,
): Promise<IdeaBrief[]> {
  return db
    .select({ id: researchIdeas.id, title: researchIdeas.title, summary: researchIdeas.summary })
    .from(researchIdeas)
    .where(and(eq(researchIdeas.topicId, topicId), eq(researchIdeas.status, "dismissed")))
    .orderBy(desc(researchIdeas.updatedAt))
    .limit(limit);
}

/** A run's evidence that can belong to an idea (pain, request, workaround), in a fixed order. */
export async function runMatchableEvidence(
  db: Db,
  runId: string,
): Promise<Array<{ id: string; quote: string }>> {
  return db
    .select({ id: researchEvidence.id, quote: researchEvidence.quote })
    .from(researchEvidence)
    .where(
      and(
        eq(researchEvidence.runId, runId),
        inArray(researchEvidence.kind, [...IDEA_EVIDENCE_KINDS]),
      ),
    )
    .orderBy(asc(researchEvidence.createdAt), asc(researchEvidence.id));
}

export async function createIdea(
  db: Db,
  idea: { userId: string; topicId: string; runId: string; title: string; summary: string },
): Promise<string> {
  const id = randomUUID();
  await db.insert(researchIdeas).values({
    id,
    userId: idea.userId,
    topicId: idea.topicId,
    title: idea.title,
    summary: idea.summary,
    firstRunId: idea.runId,
  });
  return id;
}

/** Attach quotes to ideas. A quote already in an idea stays where it is. */
export async function attachEvidence(
  db: Db,
  rows: Array<{ ideaId: string; evidenceId: string; runId: string }>,
): Promise<void> {
  if (!rows.length) return;
  await db.insert(researchIdeaEvidence).values(rows).onConflictDoNothing();
}

/** Ideas a run created that still carry the matcher's name, for the naming pass. */
export async function newModelNamedIdeas(
  db: Db,
  runId: string,
  limit: number,
): Promise<Array<IdeaBrief & { quotes: string[] }>> {
  const ideas = await db
    .select({ id: researchIdeas.id, title: researchIdeas.title, summary: researchIdeas.summary })
    .from(researchIdeas)
    .where(and(eq(researchIdeas.firstRunId, runId), eq(researchIdeas.namedBy, "model")))
    .orderBy(asc(researchIdeas.createdAt), asc(researchIdeas.id))
    .limit(limit);
  if (!ideas.length) return [];
  const quotes = await db
    .select({ ideaId: researchIdeaEvidence.ideaId, quote: researchEvidence.quote })
    .from(researchIdeaEvidence)
    .innerJoin(researchEvidence, eq(researchEvidence.id, researchIdeaEvidence.evidenceId))
    .where(
      inArray(
        researchIdeaEvidence.ideaId,
        ideas.map((i) => i.id),
      ),
    )
    .orderBy(asc(researchEvidence.createdAt));
  return ideas.map((i) => ({
    ...i,
    quotes: quotes
      .filter((q) => q.ideaId === i.id)
      .slice(0, 3)
      .map((q) => q.quote),
  }));
}

/** Rename an idea the model named; an idea the user renamed is never touched. */
export async function renameModelIdea(
  db: Db,
  ideaId: string,
  title: string,
  summary: string,
): Promise<void> {
  await db
    .update(researchIdeas)
    .set({ title, summary, updatedAt: new Date() })
    .where(and(eq(researchIdeas.id, ideaId), eq(researchIdeas.namedBy, "model")));
}

/** Ideas a run created or added evidence to. */
export async function ideasTouchedByRun(db: Db, runId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ id: researchIdeas.id })
    .from(researchIdeas)
    .leftJoin(researchIdeaEvidence, eq(researchIdeaEvidence.ideaId, researchIdeas.id))
    .where(or(eq(researchIdeas.firstRunId, runId), eq(researchIdeaEvidence.runId, runId)));
  return rows.map((r) => r.id);
}

/** An idea's evidence in the shape scoring needs, with how much of it `runId` added. */
export async function ideaEvidenceForScore(
  db: Db,
  ideaId: string,
  runId: string,
): Promise<{ evidence: ScoredEvidence[]; addedByRun: number }> {
  const rows = await db
    .select({
      authorKey: researchEvidence.authorKey,
      site: researchSources.site,
      sourceId: researchEvidence.sourceId,
      sentiment: researchEvidence.sentiment,
      strong: researchEvidence.strong,
      pays: researchEvidence.pays,
      names: researchEvidence.names,
      postedAt: researchEvidence.postedAt,
      linkRun: researchIdeaEvidence.runId,
    })
    .from(researchIdeaEvidence)
    .innerJoin(researchEvidence, eq(researchEvidence.id, researchIdeaEvidence.evidenceId))
    .innerJoin(researchSources, eq(researchSources.id, researchEvidence.sourceId))
    .where(eq(researchIdeaEvidence.ideaId, ideaId));
  return {
    evidence: rows.map(({ linkRun: _linkRun, ...e }) => e),
    addedByRun: rows.filter((r) => r.linkRun === runId).length,
  };
}

export async function saveIdeaScore(
  db: Db,
  ideaId: string,
  update: { score: IdeaScore; evidenceCount: number; runId: string; addedByRun: number },
): Promise<void> {
  await db
    .update(researchIdeas)
    .set({
      score: update.score,
      scoreTotal: update.score.total,
      evidenceCount: update.evidenceCount,
      lastRunId: update.runId,
      addedLastRun: update.addedByRun,
      updatedAt: sql`now()`,
    })
    .where(eq(researchIdeas.id, ideaId));
}

export async function getIdea(db: Db, ideaId: string): Promise<IdeaRow | null> {
  const [row] = await db.select().from(researchIdeas).where(eq(researchIdeas.id, ideaId));
  return row ?? null;
}

// ---------- The product's views (ticket 12) ----------

/** One of the user's ideas, or null when it isn't theirs. */
export async function getOwnIdea(db: Db, userId: string, ideaId: string): Promise<IdeaRow | null> {
  const [row] = await db
    .select()
    .from(researchIdeas)
    .where(and(eq(researchIdeas.id, ideaId), eq(researchIdeas.userId, userId)));
  return row ?? null;
}

/**
 * A topic's ideas, best first. `status` filters: "live" (open and starred,
 * the default), or one status. Merged ideas only show when asked for.
 */
export async function topicIdeas(
  db: Db,
  userId: string,
  topicId: string,
  status: "live" | IdeaRow["status"] = "live",
): Promise<IdeaRow[]> {
  const statuses: IdeaRow["status"][] = status === "live" ? ["open", "starred"] : [status];
  return db
    .select()
    .from(researchIdeas)
    .where(
      and(
        eq(researchIdeas.topicId, topicId),
        eq(researchIdeas.userId, userId),
        inArray(researchIdeas.status, statuses),
      ),
    )
    .orderBy(desc(researchIdeas.scoreTotal), asc(researchIdeas.createdAt));
}

/** The topic's latest run that has finished (its ideas get the "New" and "+N" badges). */
export async function latestFinishedRunId(db: Db, topicId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: researchRuns.id })
    .from(researchRuns)
    .where(and(eq(researchRuns.topicId, topicId), inArray(researchRuns.state, ["done", "stopped"])))
    .orderBy(desc(researchRuns.finishedAt))
    .limit(1);
  return row?.id ?? null;
}

/** An idea's evidence with its source, strongest first. */
export async function ideaEvidence(db: Db, ideaId: string) {
  return db
    .select({
      id: researchEvidence.id,
      quote: researchEvidence.quote,
      kind: researchEvidence.kind,
      match: researchEvidence.match,
      sentiment: researchEvidence.sentiment,
      strong: researchEvidence.strong,
      pays: researchEvidence.pays,
      names: researchEvidence.names,
      postedAt: researchEvidence.postedAt,
      sourceId: researchSources.id,
      url: researchSources.url,
      title: researchSources.title,
      site: researchSources.site,
    })
    .from(researchIdeaEvidence)
    .innerJoin(researchEvidence, eq(researchEvidence.id, researchIdeaEvidence.evidenceId))
    .innerJoin(researchSources, eq(researchSources.id, researchEvidence.sourceId))
    .where(eq(researchIdeaEvidence.ideaId, ideaId))
    .orderBy(
      desc(researchEvidence.strong),
      asc(researchEvidence.sentiment),
      asc(researchEvidence.id),
    );
}

/** Rename or change status. A rename marks the idea user-named, so runs never rename it again. */
export async function updateIdea(
  db: Db,
  ideaId: string,
  patch: { title?: string; summary?: string; status?: "open" | "starred" | "dismissed" },
): Promise<void> {
  const renamed = patch.title !== undefined || patch.summary !== undefined;
  await db
    .update(researchIdeas)
    .set({ ...patch, ...(renamed ? { namedBy: "user" as const } : {}), updatedAt: sql`now()` })
    .where(eq(researchIdeas.id, ideaId));
}

/**
 * Merge `fromIds` into `intoId`, in one transaction: their evidence moves to
 * `intoId` and they become `merged` (pointing at it). The caller rescores
 * `intoId` after. Merged ideas are never offered to the matcher again, so
 * quotes about them land on `intoId` (or a new idea) from now on.
 */
export async function mergeIdeas(db: Db, intoId: string, fromIds: string[]): Promise<void> {
  if (!fromIds.length) return;
  await db.transaction(async (tx) => {
    await tx
      .update(researchIdeaEvidence)
      .set({ ideaId: intoId })
      .where(inArray(researchIdeaEvidence.ideaId, fromIds));
    await tx
      .update(researchIdeas)
      .set({
        status: "merged",
        mergedInto: intoId,
        evidenceCount: 0,
        score: null,
        scoreTotal: 0,
        addedLastRun: 0,
        updatedAt: sql`now()`,
      })
      .where(inArray(researchIdeas.id, fromIds));
  });
}

/** Store an idea's fresh score without touching its run bookkeeping. */
export async function rescoreIdea(
  db: Db,
  ideaId: string,
  score: IdeaScore,
  evidenceCount: number,
): Promise<void> {
  await db
    .update(researchIdeas)
    .set({ score, scoreTotal: score.total, evidenceCount, updatedAt: sql`now()` })
    .where(eq(researchIdeas.id, ideaId));
}

/** The pages a topic used, newest first, with how many of the topic's quotes each gave. */
export async function topicSources(db: Db, topicId: string) {
  const rows = await db
    .select({
      id: researchSources.id,
      url: researchSources.url,
      title: researchSources.title,
      site: researchSources.site,
      kind: researchSources.kind,
      addedBy: researchSources.addedBy,
      fetchedAt: researchSources.fetchedAt,
      evidenceCount: sql<number>`(
        select count(*)::int from research_evidence e
        where e.source_id = "research_sources"."id" and e.topic_id = ${topicId}
      )`,
    })
    .from(researchTopicSources)
    .innerJoin(researchSources, eq(researchSources.id, researchTopicSources.sourceId))
    .where(eq(researchTopicSources.topicId, topicId))
    .orderBy(desc(researchTopicSources.createdAt));
  return rows.map((r) => ({ ...r, evidenceCount: Number(r.evidenceCount) }));
}
