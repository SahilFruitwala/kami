import "@tanstack/react-start/server-only";
import { z } from "zod";
import { getDb } from "@/lib/db.server";
import { researchCreditBalance } from "@/lib/research-credits-db.server.ts";
import { getRun, getTopic, type RunRow } from "@/lib/research-db.server.ts";
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
import type { IdeaCard, IdeaDetail, RunView, TopicSource } from "@/lib/api/research.ts";
import { PLAN_INTENTS } from "@/lib/research/discover.ts";
import { estimateRun } from "@/lib/research/estimate.ts";
import { DEPTHS } from "@/lib/research/kinds.ts";
import { IDEA_SUMMARY_MAX, IDEA_TITLE_MAX } from "@/lib/research/match.ts";
import { scoreIdea } from "@/lib/research/score.ts";
import { isReadableUrl } from "@/lib/research/sources.ts";
import { badRequest, notFound } from "@/server/http";
import { discoverDrafter, validateEditedPlan } from "./discover";
import { draftRun, getRunStatus, requestStop, startLinkRun, startRun } from "./runs";
import { ownTopic, requireResearch } from "./topics";

/**
 * The Research product API behind the Find ideas flow, the run view, the
 * topic tabs and "paste a link" (tickets 11–13). Owner-scoped throughout:
 * anything that isn't the caller's is a 404.
 */

// ---------- Inputs ----------

const sitesInput = z.array(z.string().trim().min(1).max(100)).max(20).optional();

export const draftInput = z.object({
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
  return {
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
      kind: "discover",
      depth: input.depth,
      input: {
        seed: input.seed,
        audience: input.audience,
        includeSites: input.includeSites,
        excludeSites: input.excludeSites,
        sinceMonths: input.sinceMonths,
      },
    },
    discoverDrafter(),
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

export async function researchIdea(userId: string, ideaId: string): Promise<IdeaDetail> {
  const idea = await ownIdea(userId, ideaId);
  const db = await getDb();
  const [evidence, latest] = await Promise.all([
    ideaEvidence(db, idea.id),
    latestFinishedRunId(db, idea.topicId),
  ]);
  return {
    idea: ideaCard(idea, latest),
    evidence: evidence.map((e) => ({
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
    })),
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
