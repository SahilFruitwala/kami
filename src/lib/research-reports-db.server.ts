import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { ReportBody } from "./research/report.ts";
import {
  researchEvidence,
  researchIdeaEvidence,
  researchReports,
  researchSources,
} from "./schema.ts";

/**
 * Research reports in Postgres: storing a run's report, reading it back with
 * the evidence it cites, and the evidence a report draft is shown. Kept free
 * of app path aliases so tests/db can drive it against a real database.
 */

type Db = NodePgDatabase<any>;

export type ReportRow = typeof researchReports.$inferSelect;

/** Store a run's report; a run has at most one (a redo keeps the first). */
export async function insertReport(
  db: Db,
  report: {
    userId: string;
    topicId: string;
    runId: string;
    kind: "validate" | "question";
    ideaId: string | null;
    question: string;
    body: ReportBody;
  },
): Promise<string> {
  const [row] = await db
    .insert(researchReports)
    .values({ id: randomUUID(), ...report })
    .onConflictDoNothing({ target: researchReports.runId })
    .returning({ id: researchReports.id });
  if (row) return row.id;
  const [existing] = await db
    .select({ id: researchReports.id })
    .from(researchReports)
    .where(eq(researchReports.runId, report.runId));
  return existing.id;
}

export async function reportForRun(db: Db, runId: string): Promise<ReportRow | null> {
  const [row] = await db.select().from(researchReports).where(eq(researchReports.runId, runId));
  return row ?? null;
}

export async function getOwnReport(db: Db, userId: string, id: string): Promise<ReportRow | null> {
  const [row] = await db
    .select()
    .from(researchReports)
    .where(and(eq(researchReports.id, id), eq(researchReports.userId, userId)));
  return row ?? null;
}

export async function topicReports(db: Db, topicId: string): Promise<ReportRow[]> {
  return db
    .select()
    .from(researchReports)
    .where(eq(researchReports.topicId, topicId))
    .orderBy(desc(researchReports.createdAt));
}

const EVIDENCE_COLUMNS = {
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
};

export type ReportEvidence = {
  id: string;
  quote: string;
  kind: string;
  match: "exact" | "close";
  sentiment: number;
  strong: boolean;
  pays: boolean;
  names: string[];
  postedAt: Date | null;
  sourceId: string;
  url: string;
  title: string;
  site: string;
};

/** Evidence by id within a topic, with its source (ids from another topic are ignored). */
export async function evidenceByIds(
  db: Db,
  topicId: string,
  ids: string[],
): Promise<ReportEvidence[]> {
  if (!ids.length) return [];
  return db
    .select(EVIDENCE_COLUMNS)
    .from(researchEvidence)
    .innerJoin(researchSources, eq(researchSources.id, researchEvidence.sourceId))
    .where(and(eq(researchEvidence.topicId, topicId), inArray(researchEvidence.id, ids)));
}

/**
 * What a report draft is shown: the quotes behind the idea (when given), plus
 * every quote on the pages this run read, strongest first, capped at `limit`.
 */
export async function evidenceForReport(
  db: Db,
  topicId: string,
  input: { ideaId?: string | null; sourceIds: string[]; limit: number },
): Promise<ReportEvidence[]> {
  const rows: ReportEvidence[] = [];
  if (input.ideaId) {
    rows.push(
      ...(await db
        .select(EVIDENCE_COLUMNS)
        .from(researchIdeaEvidence)
        .innerJoin(researchEvidence, eq(researchEvidence.id, researchIdeaEvidence.evidenceId))
        .innerJoin(researchSources, eq(researchSources.id, researchEvidence.sourceId))
        .where(eq(researchIdeaEvidence.ideaId, input.ideaId))
        .orderBy(desc(researchEvidence.strong), asc(researchEvidence.id))
        .limit(input.limit)),
    );
  }
  if (input.sourceIds.length) {
    const seen = new Set(rows.map((r) => r.id));
    const fromPages = await db
      .select(EVIDENCE_COLUMNS)
      .from(researchEvidence)
      .innerJoin(researchSources, eq(researchSources.id, researchEvidence.sourceId))
      .where(
        and(
          eq(researchEvidence.topicId, topicId),
          inArray(researchEvidence.sourceId, input.sourceIds),
        ),
      )
      .orderBy(
        desc(researchEvidence.strong),
        sql`abs(${researchEvidence.sentiment}) desc`,
        asc(researchEvidence.id),
      );
    for (const r of fromPages) {
      if (rows.length >= input.limit) break;
      if (!seen.has(r.id)) rows.push(r);
    }
  }
  return rows.slice(0, input.limit);
}
