import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { ReportKind } from "./research/kinds.ts";
import type { ReportBody } from "./research/report.ts";
import { researchEvidence, researchReports, researchSources } from "./schema.ts";

/**
 * Research reports in Postgres. Owner-scoped reads; a wrong id is "not found".
 */

type Db = NodePgDatabase<any>;

export type ReportRow = typeof researchReports.$inferSelect;

export async function upsertReport(
  db: Db,
  row: {
    userId: string;
    topicId: string;
    runId: string;
    kind: ReportKind;
    ideaId?: string | null;
    question?: string;
    body: ReportBody;
  },
): Promise<ReportRow> {
  const values = {
    id: randomUUID(),
    userId: row.userId,
    topicId: row.topicId,
    runId: row.runId,
    kind: row.kind,
    ideaId: row.ideaId ?? null,
    question: row.question ?? "",
    body: row.body,
  };
  const [saved] = await db
    .insert(researchReports)
    .values(values)
    .onConflictDoUpdate({
      target: researchReports.runId,
      set: { body: row.body, kind: row.kind, ideaId: values.ideaId, question: values.question },
    })
    .returning();
  return saved;
}

export async function getReportByRun(db: Db, runId: string): Promise<ReportRow | null> {
  const [row] = await db.select().from(researchReports).where(eq(researchReports.runId, runId));
  return row ?? null;
}

export async function getOwnReport(
  db: Db,
  userId: string,
  reportId: string,
): Promise<ReportRow | null> {
  const [row] = await db
    .select()
    .from(researchReports)
    .where(and(eq(researchReports.id, reportId), eq(researchReports.userId, userId)));
  return row ?? null;
}

export async function listTopicReports(
  db: Db,
  userId: string,
  topicId: string,
): Promise<ReportRow[]> {
  return db
    .select()
    .from(researchReports)
    .where(and(eq(researchReports.topicId, topicId), eq(researchReports.userId, userId)))
    .orderBy(desc(researchReports.createdAt));
}

export async function topicEvidenceIds(db: Db, topicId: string): Promise<Set<string>> {
  const rows = await db
    .select({ id: researchEvidence.id })
    .from(researchEvidence)
    .where(eq(researchEvidence.topicId, topicId));
  return new Set(rows.map((r) => r.id));
}

export async function evidenceByIds(db: Db, topicId: string, ids: string[]) {
  if (!ids.length) return [];
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
    .from(researchEvidence)
    .innerJoin(researchSources, eq(researchSources.id, researchEvidence.sourceId))
    .where(and(eq(researchEvidence.topicId, topicId), inArray(researchEvidence.id, ids)));
}
