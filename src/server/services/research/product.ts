import "@tanstack/react-start/server-only";
import { z } from "zod";
import { getDb } from "@/lib/db.server";
import { researchCreditBalance } from "@/lib/research-credits-db.server.ts";
import { getRun, getTopic, type RunRow } from "@/lib/research-db.server.ts";
import {
  evidenceByIds,
  getOwnReport,
  reportForRun,
  topicReports,
  type ReportRow,
} from "@/lib/research-reports-db.server.ts";
import {
  getIdea,
  getOwnIdea,
  ideaEvidence,
  ideaEvidenceForScore,
  ideasTouchedByRun,
  latestFinishedRunId,
  mergeIdeas,
  rescoreIdea,
  topicIdeas,
  topicSources,
  updateIdea,
  type IdeaRow,
} from "@/lib/research-ideas-db.server.ts";
import type {
  EvidenceView,
  IdeaCard,
  IdeaDetail,
  PlayerView,
  ReportSummary,
  ReportView,
  RunView,
  TopicSource,
} from "@/lib/api/research.ts";
import { PLAN_INTENTS } from "@/lib/research/discover.ts";
import { estimateRun } from "@/lib/research/estimate.ts";
import { DEPTHS } from "@/lib/research/kinds.ts";
import { IDEA_SUMMARY_MAX, IDEA_TITLE_MAX } from "@/lib/research/match.ts";
import {
  MIN_COUNTER_QUERIES,
  citedEvidenceIds,
  counterQueryCount,
  unsupportedCount,
} from "@/lib/research/report.ts";
import { scoreIdea } from "@/lib/research/score.ts";
import { isReadableUrl } from "@/lib/research/sources.ts";
import { badRequest, notFound } from "@/server/http";
import { discoverDrafter, validateEditedPlan } from "./discover";
import { draftRun, getRunStatus, requestStop, startLinkRun, startRun } from "./runs";
import { ownTopic, requireResearch } from "./topics";
import { topicPlayers } from "@/lib/research-players-db.server.ts";
import { exploreDrafter } from "./explore";
import { validateDrafter } from "./validate";

/**
 * The Research product API behind the Find ideas flow, the run view, the
 * topic tabs and "paste a link" (tickets 11–13). Owner-scoped throughout:
 * anything that isn't the caller's is a 404.
 */

// ---------- Inputs ----------

const sitesInput = z.array(z.string().trim().min(1).max(100)).max(20).optional();

export const draftInput = z.object({
  /** Find ideas (the default), Ask a question, or Map a space. */
  kind: z.enum(["discover", "question", "explore"]).default("discover"),
  topicId: z.string().min(1).max(100).optional(),
  seed: z.string().trim().min(3).max(200),
  depth: z.enum(DEPTHS),
  audience: z.enum(["b2b", "b2c", "any"]).optional(),
  includeSites: sitesInput,
  excludeSites: sitesInput,
  sinceMonths: z.number().int().min(1).max(60).optional(),
});

export const startInput = z.object({
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

export const validateInput = z.object({ depth: z.enum(DEPTHS) });

export const ideasQuery = z.object({
  status: z.enum(["live", "open", "starred", "dismissed", "merged"]).optional(),
});

export const ideaPatchInput = z
  .object({
    title: z.string().trim().min(1).max(IDEA_TITLE_MAX).optional(),
    summary: z.string().trim().max(IDEA_SUMMARY_MAX).optional(),
    status: z.enum(["open", "starred", "dismissed"]).optional(),
  })
  .refine((p) => Object.keys(p).length > 0, "Nothing to change.");

export const mergeInput = z.object({
  intoId: z.string().min(1).max(100),
  fromIds: z.array(z.string().min(1).max(100)).min(1).max(50),
});

export const linkInput = z.object({ url: z.string().trim().url().max(2000) });

// ---------- Views ----------

export function ideaCard(idea: IdeaRow, latestRunId: string | null): IdeaCard {
  const fromLatest = latestRunId !== null && idea.lastRunId === latestRunId;
  return {
    id: idea.id,
    topicId: idea.topicId,
    title: idea.title,
    summary: idea.summary,
    status: idea.status,
    score: idea.score,
    evidenceCount: idea.evidenceCount,
    addedLastRun: fromLatest ? idea.addedLastRun : 0,
    isNew: fromLatest && idea.firstRunId === latestRunId,
    renamed: idea.namedBy === "user",
  };
}

async function runView(row: RunRow, userId: string): Promise<RunView> {
  const db = await getDb();
  const topic = await getTopic(db, userId, row.topicId);
  const ideaIds = await ideasTouchedByRun(db, row.id);
  const ideas = (await Promise.all(ideaIds.map((id) => getIdea(db, id))))
    .filter((i): i is IdeaRow => i !== null && i.status !== "merged")
    .sort((a, b) => b.scoreTotal - a.scoreTotal)
    .map((i) => {
      const card = ideaCard(i, row.id);
      // A run still working hasn't scored yet; its own ideas are all it shows.
      return { ...card, isNew: i.firstRunId === row.id };
    });
  const report =
    row.kind === "discover" || row.kind === "explore" ? null : await reportForRun(db, row.id);
  return {
    reportId: report?.id ?? null,
    run: {
      id: row.id,
      topicId: row.topicId,
      topicName: topic?.name ?? "",
      kind: row.kind,
      state: row.state,
      stopReason: row.stopReason,
      step: row.step,
      depth: row.depth,
      input: row.input,
      plan: row.plan,
      progress: row.progress,
      budgetCredits: row.budgetCredits,
      firecrawlCredits: row.firecrawlCredits,
      tokensIn: row.tokensIn,
      tokensOut: row.tokensOut,
      chargedCredits: row.chargedCredits,
      error: row.error,
      createdAt: row.createdAt.getTime(),
      startedAt: row.startedAt ? row.startedAt.getTime() : null,
      finishedAt: row.finishedAt ? row.finishedAt.getTime() : null,
    },
    estimates: { quick: estimateRun(row.plan, "quick"), deep: estimateRun(row.plan, "deep") },
    balance: await researchCreditBalance(db, userId),
    ideas,
  };
}

// ---------- Runs (ticket 11) ----------

export async function draftDiscoverRun(
  userId: string,
  input: z.output<typeof draftInput>,
): Promise<RunView> {
  requireResearch();
  const { run } = await draftRun(
    userId,
    {
      topicId: input.topicId,
      kind: input.kind,
      depth: input.depth,
      input: {
        seed: input.seed,
        audience: input.audience,
        includeSites: input.includeSites,
        excludeSites: input.excludeSites,
        sinceMonths: input.sinceMonths,
      },
    },
    input.kind === "question"
      ? validateDrafter({}, "question")
      : input.kind === "explore"
        ? exploreDrafter()
        : discoverDrafter(),
  );
  return runView(run, userId);
}

/** "Validate this idea": a Validate run in the idea's topic, awaiting its plan. */
export async function draftValidateRun(
  userId: string,
  ideaId: string,
  input: z.output<typeof validateInput>,
): Promise<RunView> {
  const idea = await ownIdea(userId, ideaId);
  if (idea.status === "merged") throw badRequest("That idea was merged into another.");
  const { run } = await draftRun(
    userId,
    {
      topicId: idea.topicId,
      kind: "validate",
      depth: input.depth,
      input: { seed: idea.title, ideaId: idea.id },
    },
    validateDrafter(),
  );
  return runView(run, userId);
}

export async function startDiscoverRun(
  userId: string,
  runId: string,
  input: z.output<typeof startInput>,
  origin: string,
) {
  requireResearch();
  const run = await getRun(await getDb(), userId, runId);
  if (!run) throw notFound("Run not found");
  const plan = await validateEditedPlan(run, input.plan, input.depth);
  if (run.kind === "validate" && counterQueryCount(plan) < MIN_COUNTER_QUERIES) {
    throw badRequest(
      `Keep at least ${MIN_COUNTER_QUERIES} counter-evidence searches: a validation has to look for reasons the idea may not work.`,
    );
  }
  await startRun(userId, runId, { plan, depth: input.depth }, origin);
  return { runId };
}

export async function stopResearchRun(userId: string, runId: string, origin: string) {
  requireResearch();
  await requestStop(userId, runId, origin);
  return { runId };
}

/** The run view's 2 s poll; restarts a stalled run. */
export async function researchRun(userId: string, runId: string, origin: string): Promise<RunView> {
  requireResearch();
  return runView(await getRunStatus(userId, runId, origin), userId);
}

// ---------- Ideas and sources (ticket 12) ----------

export async function listTopicIdeas(
  userId: string,
  topicId: string,
  status: z.output<typeof ideasQuery>["status"],
): Promise<IdeaCard[]> {
  await ownTopic(userId, topicId);
  const db = await getDb();
  const [ideas, latest] = await Promise.all([
    topicIdeas(db, userId, topicId, status ?? "live"),
    latestFinishedRunId(db, topicId),
  ]);
  return ideas.map((i) => ideaCard(i, latest));
}

async function ownIdea(userId: string, ideaId: string): Promise<IdeaRow> {
  requireResearch();
  const idea = await getOwnIdea(await getDb(), userId, ideaId);
  if (!idea) throw notFound("Idea not found");
  return idea;
}

function evidenceView(e: Awaited<ReturnType<typeof evidenceByIds>>[number]): EvidenceView {
  return {
    id: e.id,
    quote: e.quote,
    kind: e.kind,
    match: e.match,
    sentiment: e.sentiment,
    strong: e.strong,
    pays: e.pays,
    names: e.names,
    postedAt: e.postedAt ? e.postedAt.getTime() : null,
    source: { id: e.sourceId, url: e.url, title: e.title, site: e.site },
  };
}

export async function researchIdea(userId: string, ideaId: string): Promise<IdeaDetail> {
  const idea = await ownIdea(userId, ideaId);
  const db = await getDb();
  const [evidence, latest] = await Promise.all([
    ideaEvidence(db, idea.id),
    latestFinishedRunId(db, idea.topicId),
  ]);
  return {
    idea: ideaCard(idea, latest),
    evidence: evidence.map(evidenceView),
  };
}

export async function patchIdea(
  userId: string,
  ideaId: string,
  patch: z.output<typeof ideaPatchInput>,
): Promise<IdeaCard> {
  const idea = await ownIdea(userId, ideaId);
  if (idea.status === "merged") throw badRequest("That idea was merged into another.");
  const db = await getDb();
  await updateIdea(db, idea.id, patch);
  return ideaCard(
    (await getIdea(db, idea.id)) as IdeaRow,
    await latestFinishedRunId(db, idea.topicId),
  );
}

/** Merge ideas of one topic into `intoId`, then rescore it from all its evidence. */
export async function mergeResearchIdeas(
  userId: string,
  input: z.output<typeof mergeInput>,
): Promise<IdeaCard> {
  const into = await ownIdea(userId, input.intoId);
  const fromIds = [...new Set(input.fromIds)].filter((id) => id !== into.id);
  if (!fromIds.length) throw badRequest("Pick at least one other idea to merge.");
  if (into.status === "merged") throw badRequest("Can't merge into a merged idea.");
  const db = await getDb();
  for (const id of fromIds) {
    const from = await getOwnIdea(db, userId, id);
    if (!from) throw notFound("Idea not found");
    if (from.topicId !== into.topicId)
      throw badRequest("Only ideas in the same topic can be merged.");
    if (from.status === "merged") throw badRequest("One of those ideas was already merged.");
  }
  await mergeIdeas(db, into.id, fromIds);
  const { evidence } = await ideaEvidenceForScore(db, into.id, "");
  await rescoreIdea(db, into.id, scoreIdea(evidence, Date.now()), evidence.length);
  return ideaCard(
    (await getIdea(db, into.id)) as IdeaRow,
    await latestFinishedRunId(db, into.topicId),
  );
}

export async function listTopicSources(userId: string, topicId: string): Promise<TopicSource[]> {
  await ownTopic(userId, topicId);
  const rows = await topicSources(await getDb(), topicId);
  return rows.map((r) => ({ ...r, fetchedAt: r.fetchedAt.getTime() }));
}

// ---------- Paste a link (ticket 13) ----------

export async function pasteLink(userId: string, topicId: string, url: string, origin: string) {
  await ownTopic(userId, topicId);
  if (!isReadableUrl(url))
    throw badRequest("Research only reads web pages (http or https, no files).");
  const run = await startLinkRun(userId, topicId, url, origin);
  return { runId: run.id };
}

// ---------- Reports (tickets 15–16) ----------

function reportSummary(r: ReportRow): ReportSummary {
  return {
    id: r.id,
    topicId: r.topicId,
    runId: r.runId,
    kind: r.kind,
    ideaId: r.ideaId,
    question: r.question,
    claims: r.body.sections.reduce((n, s) => n + s.claims.filter((c) => !c.note).length, 0),
    unsupported: unsupportedCount(r.body),
    partial: Boolean(r.body.partial),
    createdAt: r.createdAt.getTime(),
  };
}

export async function listTopicReports(userId: string, topicId: string): Promise<ReportSummary[]> {
  await ownTopic(userId, topicId);
  return (await topicReports(await getDb(), topicId)).map(reportSummary);
}

/** A report with the evidence its claims cite (each quote with its source). */
export async function researchReport(userId: string, reportId: string): Promise<ReportView> {
  requireResearch();
  const db = await getDb();
  const report = await getOwnReport(db, userId, reportId);
  if (!report) throw notFound("Report not found");
  const rows = await evidenceByIds(db, report.topicId, citedEvidenceIds(report.body));
  return {
    report: reportSummary(report),
    body: report.body,
    evidence: Object.fromEntries(rows.map((e) => [e.id, evidenceView(e)])),
  };
}

// ---------- Players (ticket 17) ----------

/** A topic's players, most-mentioned first (the table sorts and groups them). */
export async function listTopicPlayers(userId: string, topicId: string): Promise<PlayerView[]> {
  await ownTopic(userId, topicId);
  const rows = await topicPlayers(await getDb(), topicId);
  return rows
    .map((p) => ({
      id: p.id,
      name: p.name,
      url: p.url,
      category: p.category,
      oneLiner: p.oneLiner,
      audience: p.audience,
      plans: p.pricing?.plans ?? [],
      freePlan: p.freePlan,
      mentions: p.mentions,
      complaints: p.complaints,
      filled: p.filledAt !== null,
    }))
    .sort((a, b) => b.mentions - a.mentions || a.name.localeCompare(b.name));
}
