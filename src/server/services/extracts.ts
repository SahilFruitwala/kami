import "@tanstack/react-start/server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { ExtractResult, ExtractSource, ExtractsOverview } from "@/lib/api/extracts";
import { getDb, type AppDb } from "@/lib/db";
import { askPage, firecrawlApiKey, FirecrawlError } from "@/lib/firecrawl.server.ts";
import { markdownToHtml } from "@/lib/markdown.ts";
import { assertPublicHttpUrl } from "@/lib/safe-url.ts";
import { sanitizeHtml } from "@/lib/sanitize-html.server.ts";
import {
  extractResults,
  extractSources,
  type ExtractResultRow,
  type ExtractSourceRow,
} from "@/lib/schema";
import { uid } from "@/lib/id";
import { badRequest, HttpError, notFound } from "@/server/http";

/**
 * Extracts: saved Firecrawl questions ("latest products on Product Hunt —
 * name, link, category"). Running one stores the Markdown answer as a pending
 * result; the user accepts it into the source's history or discards it.
 */

export const MAX_SOURCES = 50;
const MAX_HISTORY = 50;

// ---------- Schemas ----------

const name = z.string().trim().max(120);
const url = z.string().trim().min(4, "Paste the page URL.").max(2000);
const question = z
  .string()
  .trim()
  .min(8, "Describe what to pull from the page.")
  .max(2000, "Keep the question under 2000 characters.");

export const createSourceInput = z.object({ name: name.optional(), url, question });
export const updateSourceInput = z.object({
  name: name.optional(),
  url: url.optional(),
  question: question.optional(),
});
export const extractIdParams = z.object({ id: z.string().min(1).max(200) });
export const runInput = z.object({ fresh: z.boolean().optional() });

// ---------- Mapping ----------

const ms = (value: Date | null): number | null => (value == null ? null : value.getTime());

function toResult(row: ExtractResultRow): ExtractResult {
  return {
    id: row.id,
    sourceId: row.sourceId,
    status: row.status,
    markdown: row.markdown,
    html: sanitizeHtml(markdownToHtml(row.markdown), row.url),
    url: row.url,
    question: row.question,
    createdAt: row.createdAt.getTime(),
    acceptedAt: ms(row.acceptedAt),
  };
}

function toSource(
  row: ExtractSourceRow,
  pending: ExtractResultRow | null,
  acceptedCount: number,
): ExtractSource {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    question: row.question,
    lastRunAt: ms(row.lastRunAt),
    lastError: row.lastError,
    createdAt: row.createdAt.getTime(),
    pending: pending ? toResult(pending) : null,
    acceptedCount,
  };
}

function normalizeUrl(raw: string): string {
  try {
    return assertPublicHttpUrl(raw.includes("://") ? raw : `https://${raw}`).href;
  } catch (err) {
    throw badRequest(err instanceof Error ? err.message : "That URL can't be used.");
  }
}

function defaultName(pageUrl: string): string {
  try {
    return new URL(pageUrl).hostname.replace(/^www\./, "");
  } catch {
    return pageUrl;
  }
}

async function ownedSource(db: AppDb, userId: string, id: string): Promise<ExtractSourceRow> {
  const [row] = await db
    .select()
    .from(extractSources)
    .where(and(eq(extractSources.id, id), eq(extractSources.userId, userId)))
    .limit(1);
  if (!row) throw notFound("That extract no longer exists.");
  return row;
}

async function loadSource(db: AppDb, row: ExtractSourceRow): Promise<ExtractSource> {
  const [pending] = await db
    .select()
    .from(extractResults)
    .where(and(eq(extractResults.sourceId, row.id), eq(extractResults.status, "pending")))
    .limit(1);
  const [count] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(extractResults)
    .where(and(eq(extractResults.sourceId, row.id), eq(extractResults.status, "accepted")));
  return toSource(row, pending ?? null, count?.n ?? 0);
}

// ---------- Sources ----------

export async function getExtractsOverview(userId: string): Promise<ExtractsOverview> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(extractSources)
    .where(eq(extractSources.userId, userId))
    .orderBy(sql`lower(${extractSources.name})`, extractSources.id);

  const pending = await db
    .select()
    .from(extractResults)
    .where(and(eq(extractResults.userId, userId), eq(extractResults.status, "pending")));
  const counts = await db
    .select({ sourceId: extractResults.sourceId, n: sql<number>`count(*)::int` })
    .from(extractResults)
    .where(and(eq(extractResults.userId, userId), eq(extractResults.status, "accepted")))
    .groupBy(extractResults.sourceId);

  const pendingBySource = new Map(pending.map((r) => [r.sourceId, r]));
  const countBySource = new Map(counts.map((c) => [c.sourceId, Number(c.n) || 0]));
  return {
    enabled: firecrawlApiKey() !== null,
    sources: rows.map((row) =>
      toSource(row, pendingBySource.get(row.id) ?? null, countBySource.get(row.id) ?? 0),
    ),
  };
}

export async function createExtractSource(
  userId: string,
  input: z.output<typeof createSourceInput>,
): Promise<ExtractSource> {
  const db = await getDb();
  const [count] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(extractSources)
    .where(eq(extractSources.userId, userId));
  if ((count?.n ?? 0) >= MAX_SOURCES) {
    throw badRequest(`You can keep up to ${MAX_SOURCES} extracts.`);
  }
  const pageUrl = normalizeUrl(input.url);
  const [row] = await db
    .insert(extractSources)
    .values({
      id: uid(),
      userId,
      name: input.name || defaultName(pageUrl),
      url: pageUrl,
      question: input.question,
    })
    .returning();
  return toSource(row, null, 0);
}

export async function updateExtractSource(
  userId: string,
  id: string,
  input: z.output<typeof updateSourceInput>,
): Promise<ExtractSource> {
  const db = await getDb();
  const current = await ownedSource(db, userId, id);
  const pageUrl = input.url !== undefined ? normalizeUrl(input.url) : current.url;
  const [row] = await db
    .update(extractSources)
    .set({
      name: input.name !== undefined ? input.name || defaultName(pageUrl) : current.name,
      url: pageUrl,
      question: input.question ?? current.question,
    })
    .where(and(eq(extractSources.id, id), eq(extractSources.userId, userId)))
    .returning();
  return loadSource(db, row);
}

export async function removeExtractSource(userId: string, id: string): Promise<void> {
  const db = await getDb();
  const deleted = await db
    .delete(extractSources)
    .where(and(eq(extractSources.id, id), eq(extractSources.userId, userId)))
    .returning({ id: extractSources.id });
  if (!deleted.length) throw notFound("That extract no longer exists.");
}

// ---------- Runs + results ----------

/**
 * Ask Firecrawl the source's question and store the answer as the source's
 * single pending result (replacing any earlier unreviewed one).
 */
export async function runExtract(
  userId: string,
  id: string,
  opts: z.output<typeof runInput>,
): Promise<ExtractResult> {
  const db = await getDb();
  const source = await ownedSource(db, userId, id);

  let markdown: string;
  try {
    markdown = await askPage({
      url: source.url,
      question: source.question,
      maxAge: opts.fresh ? 0 : undefined,
    });
  } catch (err) {
    const message =
      err instanceof FirecrawlError ? err.message : "Firecrawl request failed. Try again.";
    if (!(err instanceof FirecrawlError)) console.error("[extracts] run failed:", err);
    await db
      .update(extractSources)
      .set({ lastRunAt: new Date(), lastError: message })
      .where(eq(extractSources.id, source.id));
    throw new HttpError(err instanceof FirecrawlError && err.status ? err.status : 502, message);
  }

  const row = await db.transaction(async (tx) => {
    await tx
      .delete(extractResults)
      .where(and(eq(extractResults.sourceId, source.id), eq(extractResults.status, "pending")));
    const [inserted] = await tx
      .insert(extractResults)
      .values({
        id: uid(),
        sourceId: source.id,
        userId,
        status: "pending",
        markdown,
        url: source.url,
        question: source.question,
      })
      .returning();
    await tx
      .update(extractSources)
      .set({ lastRunAt: new Date(), lastError: null })
      .where(eq(extractSources.id, source.id));
    return inserted;
  });
  return toResult(row);
}

export async function listExtractResults(userId: string, id: string): Promise<ExtractResult[]> {
  const db = await getDb();
  await ownedSource(db, userId, id);
  const rows = await db
    .select()
    .from(extractResults)
    .where(and(eq(extractResults.sourceId, id), eq(extractResults.status, "accepted")))
    .orderBy(desc(extractResults.acceptedAt), desc(extractResults.id))
    .limit(MAX_HISTORY);
  return rows.map(toResult);
}

export async function acceptExtractResult(userId: string, id: string): Promise<ExtractResult> {
  const db = await getDb();
  const [row] = await db
    .update(extractResults)
    .set({ status: "accepted", acceptedAt: new Date() })
    .where(
      and(
        eq(extractResults.id, id),
        eq(extractResults.userId, userId),
        eq(extractResults.status, "pending"),
      ),
    )
    .returning();
  if (!row) throw notFound("That result was already reviewed or no longer exists.");
  return toResult(row);
}

export async function discardExtractResult(userId: string, id: string): Promise<void> {
  const db = await getDb();
  const deleted = await db
    .delete(extractResults)
    .where(and(eq(extractResults.id, id), eq(extractResults.userId, userId)))
    .returning({ id: extractResults.id });
  if (!deleted.length) throw notFound("That result no longer exists.");
}
