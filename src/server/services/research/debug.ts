import "@tanstack/react-start/server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db.server";
import { researchCreditBalance } from "@/lib/research-credits-db.server.ts";
import { getRun, runEvidence, runQueries, type RunRow } from "@/lib/research-db.server.ts";
import type { DebugOverview, DebugRun } from "@/lib/api/research.ts";
import { DEPTH_LIMITS, PLAN_INTENTS } from "@/lib/research/discover.ts";
import { DEPTHS } from "@/lib/research/kinds.ts";
import { DEPTH_BUDGETS } from "@/lib/research/run-engine.ts";
import { urlKey } from "@/lib/research/sources.ts";
import {
  researchIdeaEvidence,
  researchIdeas,
  researchRuns,
  researchSources,
  user,
} from "@/lib/schema";
import { HttpError, notFound } from "@/server/http";
import { currentResearchConfig } from "./credits";
import { discoverDrafter, validateEditedPlan } from "./discover";
import { draftRun, getRunStatus, requestStop, startRun } from "./runs";

/**
 * The operator's Discover debug page (ticket 09): draft, edit, start and
 * watch a run, and see everything it stored. Only for the emails in
 * `RESEARCH_DEBUG_EMAILS`; everyone else gets 404, so the page doesn't
 * reveal it exists. Every run still spends the caller's research credits.
 */

function debugEmails(): Set<string> {
  return new Set(
    (process.env.RESEARCH_DEBUG_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

export async function requireResearchDebug(userId: string): Promise<void> {
  const allowed = debugEmails();
  if (!allowed.size) throw notFound();
  const db = await getDb();
  const [row] = await db.select({ email: user.email }).from(user).where(eq(user.id, userId));
  if (!row || !allowed.has(row.email.toLowerCase())) throw notFound();
  if (!currentResearchConfig()) throw new HttpError(503, "Research isn't set up on this server.");
}

export const debugDraftInput = z.object({
  seed: z.string().trim().min(3).max(200),
  depth: z.enum(DEPTHS),
  topicId: z.string().min(1).max(100).optional(),
  sinceMonths: z.number().int().min(1).max(60).optional(),
  includeSites: z.array(z.string().max(100)).max(20).optional(),
  excludeSites: z.array(z.string().max(100)).max(20).optional(),
});

export const debugStartInput = z.object({
  depth: z.enum(DEPTHS),
  plan: z
    .array(
      z.object({
        id: z.string().max(20).optional(),
        query: z.string().max(300),
        site: z.string().max(100).optional(),
        intent: z.enum(PLAN_INTENTS).optional(),
        checked: z.boolean().optional(),
      }),
    )
    .max(40),
});

export async function debugOverview(userId: string): Promise<DebugOverview> {
  await requireResearchDebug(userId);
  const db = await getDb();
  const runs = await db
    .select()
    .from(researchRuns)
    .where(eq(researchRuns.userId, userId))
    .orderBy(desc(researchRuns.createdAt))
    .limit(20);
  return {
    balance: await researchCreditBalance(db, userId),
    limits: DEPTH_LIMITS,
    budgets: DEPTH_BUDGETS,
    runs: runs.map((r) => ({
      id: r.id,
      topicId: r.topicId,
      seed: r.input.seed,
      depth: r.depth,
      state: r.state,
      createdAt: r.createdAt.getTime(),
    })),
  };
}

export async function debugDraft(userId: string, input: z.output<typeof debugDraftInput>) {
  await requireResearchDebug(userId);
  const { run } = await draftRun(
    userId,
    {
      topicId: input.topicId,
      kind: "discover",
      depth: input.depth,
      input: {
        seed: input.seed,
        sinceMonths: input.sinceMonths,
        includeSites: input.includeSites,
        excludeSites: input.excludeSites,
      },
    },
    discoverDrafter(),
  );
  return { runId: run.id };
}

export async function debugStart(
  userId: string,
  runId: string,
  input: z.output<typeof debugStartInput>,
  origin: string,
) {
  await requireResearchDebug(userId);
  const run = await getRun(await getDb(), userId, runId);
  if (!run) throw notFound("Run not found");
  const plan = await validateEditedPlan(run, input.plan, input.depth);
  await startRun(userId, runId, { plan, depth: input.depth }, origin);
  return { runId };
}

export async function debugStop(userId: string, runId: string, origin: string) {
  await requireResearchDebug(userId);
  await requestStop(userId, runId, origin);
  return { runId };
}

/** Everything a run has stored, for eyeballing what each step did. */
export async function debugRun(userId: string, runId: string, origin: string): Promise<DebugRun> {
  await requireResearchDebug(userId);
  const run: RunRow = await getRunStatus(userId, runId, origin);
  const db = await getDb();
  const [queries, evidence] = await Promise.all([runQueries(db, runId), runEvidence(db, runId)]);

  const keys = (run.progress.toRead ?? []).map(urlKey).filter((k): k is string => Boolean(k));
  const sources = keys.length
    ? await db
        .select({
          id: researchSources.id,
          url: researchSources.url,
          urlKey: researchSources.urlKey,
          site: researchSources.site,
          kind: researchSources.kind,
          title: researchSources.title,
          markdown: researchSources.markdown,
          fetchedAt: researchSources.fetchedAt,
        })
        .from(researchSources)
        .where(and(eq(researchSources.userId, userId), inArray(researchSources.urlKey, keys)))
    : [];
  const sourceTitle = new Map(sources.map((s) => [s.id, `${s.site} · ${s.title}`]));

  const ideas = await db
    .select()
    .from(researchIdeas)
    .where(eq(researchIdeas.topicId, run.topicId))
    .orderBy(desc(researchIdeas.scoreTotal), asc(researchIdeas.createdAt));
  const links = ideas.length
    ? await db
        .select({
          ideaId: researchIdeaEvidence.ideaId,
          evidenceId: researchIdeaEvidence.evidenceId,
        })
        .from(researchIdeaEvidence)
        .where(
          inArray(
            researchIdeaEvidence.ideaId,
            ideas.map((i) => i.id),
          ),
        )
    : [];
  const ideaOf = new Map(links.map((l) => [l.evidenceId, l.ideaId]));

  return {
    run: {
      id: run.id,
      topicId: run.topicId,
      state: run.state,
      stopReason: run.stopReason,
      step: run.step,
      depth: run.depth,
      input: run.input,
      plan: run.plan,
      progress: run.progress,
      budgetCredits: run.budgetCredits,
      firecrawlCredits: run.firecrawlCredits,
      tokensIn: run.tokensIn,
      tokensOut: run.tokensOut,
      chargedCredits: run.chargedCredits,
      error: run.error,
      createdAt: run.createdAt.getTime(),
      startedAt: run.startedAt?.getTime() ?? null,
      finishedAt: run.finishedAt?.getTime() ?? null,
    },
    queries: queries.map((q) => ({ query: q.queryNorm, hits: q.hits })),
    sources: sources.map(({ markdown, fetchedAt, ...s }) => ({
      ...s,
      chars: markdown.length,
      preview: markdown.slice(0, 600),
      fetchedAt: fetchedAt.getTime(),
    })),
    evidence: evidence.map((e) => ({
      id: e.id,
      quote: e.quote,
      kind: e.kind,
      match: e.match,
      sentiment: e.sentiment,
      strong: e.strong,
      pays: e.pays,
      names: e.names,
      hasAuthor: Boolean(e.authorKey),
      postedAt: e.postedAt?.getTime() ?? null,
      source: sourceTitle.get(e.sourceId) ?? e.sourceId,
      ideaId: ideaOf.get(e.id) ?? null,
    })),
    ideas: ideas.map((i) => ({
      id: i.id,
      title: i.title,
      summary: i.summary,
      status: i.status,
      score: i.score,
      evidenceCount: i.evidenceCount,
      addedLastRun: i.lastRunId === runId ? i.addedLastRun : 0,
      isNew: i.firstRunId === runId,
    })),
  };
}
