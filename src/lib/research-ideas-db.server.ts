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
  researchSources,
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
