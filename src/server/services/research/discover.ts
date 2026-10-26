import "@tanstack/react-start/server-only";
import { z } from "zod";
import { getDb } from "@/lib/db.server";
import {
  insertRunQuery,
  liveIdeaTitles,
  recentTopicQueries,
  runQueries,
  topicQueryNorms,
  topicUrlKeys,
  type RunRow,
  type TopicRow,
} from "@/lib/research-db.server.ts";
import type { RunSpend } from "@/lib/research/credits.ts";
import {
  DEPTH_LIMITS,
  PLAN_INTENTS,
  normalizeQuery,
  screenResults,
  searchText,
  validatePlan,
  type ScreenedResult,
} from "@/lib/research/discover.ts";
import type { Depth, PlanQuery, TriagePick } from "@/lib/research/kinds.ts";
import { batchItems } from "@/lib/research/model-calls.ts";
import { asDocument } from "@/server/ai";
import { badRequest } from "@/server/http";
import { extractStep, fetchStep, type StepDeps } from "./evidence";
import { searchForRun } from "./fetch";
import { callModel, type Generate } from "./models";
import {
  RunStepError,
  registerRunSteps,
  type DraftResult,
  type Meter,
  type ResearchStep,
  type StepContext,
} from "./runs";

/**
 * Discover: find product ideas in what people say online. This module drafts
 * a run's plan (one writer-tier call, no Firecrawl), and holds the steps:
 * `search` sends each checked query once and keeps its results with it;
 * `triage` screens them in code and asks the worker model, in batches, which
 * are worth reading. `fetch` and `extract` (./evidence) turn the picks into
 * checked quotes; match and score follow (ticket 08).
 */

export const PLAN_PROMPT_VERSION = "discover-plan-v1";
export const TRIAGE_PROMPT_VERSION = "discover-triage-v1";

/** Results per triage call, and the characters they may take. */
const TRIAGE_BATCH = { maxItems: 40, maxChars: 24_000 };

/** Swappable outside calls (tests pass fakes). */
export type DiscoverDeps = StepDeps;

// ---------- Plan ----------

const planSchema = z.object({
  queries: z
    .array(
      z.object({
        query: z.string(),
        site: z.string().nullish(),
        intent: z.enum(PLAN_INTENTS).catch("pain"),
      }),
    )
    .max(40),
});

const PLAN_INSTRUCTIONS = `You plan web searches that find what real people say about their problems in a space: complaints, frustrations, wishes, workarounds, switching between tools, and what they pay.

Write search queries the way people talk when something hurts ("so frustrating", "I wish", "is there a tool", "alternative to", "switched from", "how do you deal with"), not marketing language. Mix where you look: Reddit (site reddit.com), Hacker News (site news.ycombinator.com), review sites (g2.com, capterra.com, trustpilot.com, app store reviews), Product Hunt, forums and the open web. Put a site in "site", not in the query text. Each query is short (under 12 words) and different from the others and from the queries already searched.

intent is one of: pain (complaints), wish (things people want), switching (moving between tools), alternatives (looking for other options), pricing (what people pay or would pay).`;

/** Turns a model's plan into a clean one; shared by drafting and tests. */
function planFromModel(
  output: z.output<typeof planSchema>,
  run: Pick<RunRow, "input" | "depth">,
  sent: ReadonlySet<string>,
): PlanQuery[] {
  return validatePlan(
    output.queries.map((q, i) => ({
      id: `q${i + 1}`,
      query: q.query,
      site: q.site ?? undefined,
      intent: q.intent,
    })),
    run.input,
    run.depth,
    sent,
    "draft",
  );
}

/**
 * The drafter `draftRun` calls for Discover: one writer-tier call that sees
 * the seed, the filters, the topic's live ideas (to look for new ground and
 * more support) and its recent queries (to avoid repeats). Spends no
 * Firecrawl credits; its tokens are returned to be charged if the run starts.
 */
export function discoverDrafter(deps: DiscoverDeps = {}) {
  return async (run: RunRow, topic: TopicRow): Promise<DraftResult> => {
    const db = await getDb();
    const [sent, ideas, recent] = await Promise.all([
      topicQueryNorms(db, topic.id),
      liveIdeaTitles(db, topic.id, 50),
      recentTopicQueries(db, topic.id, 50),
    ]);
    const spend = { tokensIn: 0, tokensOut: 0 };
    // Nothing is reserved yet, so drafting isn't budget-checked; the call's
    // own output cap bounds it, and its tokens are charged if the run starts.
    const meter: Meter = {
      ensureBudget: () => {},
      recordSpend: async (s: Partial<RunSpend>) => {
        spend.tokensIn += s.tokensIn ?? 0;
        spend.tokensOut += s.tokensOut ?? 0;
      },
    };
    const input = run.input;
    const limits = DEPTH_LIMITS[run.depth];
    const filters = [
      input.audience && input.audience !== "any" ? `Audience: ${input.audience.toUpperCase()}` : "",
      input.includeSites?.length ? `Only these sites: ${input.includeSites.join(", ")}` : "",
      input.excludeSites?.length ? `Never these sites: ${input.excludeSites.join(", ")}` : "",
      input.sinceMonths ? `Results from the last ${input.sinceMonths} months only.` : "",
    ].filter(Boolean);
    const prompt = [
      `Seed: ${input.seed}`,
      ...filters,
      `Write ${limits.maxQueries} queries.`,
      ideas.length
        ? `Ideas this topic already has (look for new ground, and for more people describing these):\n${asDocument(ideas.map((t) => `- ${t}`).join("\n"))}`
        : "",
      recent.length
        ? `Already searched (don't repeat):\n${recent.map((q) => `- ${q}`).join("\n")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const output = await callModel(
      meter,
      {
        tier: "writer",
        schema: planSchema,
        promptVersion: PLAN_PROMPT_VERSION,
        instructions: PLAN_INSTRUCTIONS,
        prompt,
        maxOutputTokens: 1_500,
        temperature: 0.4,
      },
      deps.generate,
    );
    const plan = planFromModel(output, run, sent);
    if (!plan.some((q) => q.checked)) {
      throw new RunStepError(
        "Couldn't draft new searches for that seed. Try wording it differently.",
      );
    }
    return { plan, ...spend };
  };
}

/**
 * Clean a plan the user edited before starting: same rules as a draft, but
 * their checkboxes stand. Throws 400 when nothing is left to search.
 */
export async function validateEditedPlan(
  run: Pick<RunRow, "input" | "topicId">,
  plan: Array<Partial<PlanQuery>>,
  depth: Depth,
): Promise<PlanQuery[]> {
  const sent = await topicQueryNorms(await getDb(), run.topicId);
  const clean = validatePlan(plan, run.input, depth, sent, "edited");
  if (!clean.some((q) => q.checked)) throw badRequest("Check at least one search to run.");
  return clean;
}

// ---------- Steps ----------

/** `search`: one unit per checked query, each sent once; results are stored with the query. */
function searchStep(deps: DiscoverDeps): ResearchStep {
  return {
    name: "search",
    unitBudgetMs: 60_000,
    async work(ctx) {
      const db = await getDb();
      const { run } = ctx;
      const plan = run.plan.filter((q) => q.checked);
      const sent = new Set((await runQueries(db, run.id)).map((q) => q.queryNorm));
      const next = plan.find((q) => !sent.has(normalizeQuery(searchText(q))));
      if (!next) {
        await ctx.saveProgress({ queries: plan.length, searched: plan.length });
        return true;
      }
      const text = searchText(next);
      const hits = await searchForRun(
        ctx,
        text,
        DEPTH_LIMITS[run.depth].resultsPerQuery,
        { sinceMonths: run.input.sinceMonths },
        deps.calls,
      );
      await insertRunQuery(db, {
        userId: run.userId,
        topicId: run.topicId,
        runId: run.id,
        queryNorm: normalizeQuery(text),
        hits: hits.map(({ url, title, description }) => ({ url, title, description })),
      });
      await ctx.saveProgress({ queries: plan.length, searched: sent.size + 1 });
      return sent.size + 1 >= plan.length;
    },
  };
}

const triageSchema = z.object({ read: z.array(z.number().int()).max(60) });

const TRIAGE_INSTRUCTIONS = `You choose which search results are worth reading to learn what real people say about a space: their problems, frustrations, wishes, workarounds, and what they pay or would pay.

Read: pages where people describe their own experience in their own words (forum and Reddit threads, Hacker News discussions, product reviews, Q&A, comment sections).
Skip: marketing and product pages, "best tools" listicles, news with no discussion, tutorials, and anything off the topic.

Answer with the numbers of the results to read. When unsure, skip.`;

/** One worker call over a batch of results; returns the ones it chose. */
async function triageBatch(
  ctx: StepContext,
  seed: string,
  batch: ScreenedResult[],
  generate?: Generate,
): Promise<ScreenedResult[]> {
  const list = batch
    .map((r, i) => `${i + 1}. ${r.title}\n   ${r.site}\n   ${r.description}`)
    .join("\n");
  const output = await callModel(
    ctx,
    {
      tier: "worker",
      schema: triageSchema,
      promptVersion: TRIAGE_PROMPT_VERSION,
      instructions: TRIAGE_INSTRUCTIONS,
      prompt: `Topic: ${seed}\n\nResults:\n${asDocument(list)}`,
      maxOutputTokens: 300,
      temperature: 0,
    },
    generate,
  );
  const chosen = new Set(output.read.filter((n) => n >= 1 && n <= batch.length));
  return batch.filter((_, i) => chosen.has(i + 1));
}

/**
 * `triage`: screen all of the run's results in code (drop files, video and
 * login-walled sites, duplicates and pages the topic already has; rank by
 * pain words, questions and discussion pages), then one worker call per
 * batch of the best candidates. Each batch is one unit; a resumed run
 * redoes nothing it finished (and an interrupted batch is answered from the
 * model cache). Ends with the best `pagesToRead` picks in `progress.toRead`.
 */
function triageStep(deps: DiscoverDeps): ResearchStep {
  return {
    name: "triage",
    async work(ctx) {
      const db = await getDb();
      const { run } = ctx;
      const limits = DEPTH_LIMITS[run.depth];
      const hits = (await runQueries(db, run.id)).flatMap((q) => q.hits);
      const { candidates, distinct } = screenResults(hits, {
        excludeSites: run.input.excludeSites,
        topicKeys: await topicUrlKeys(db, run.userId, run.topicId),
        maxCandidates: limits.maxCandidates,
      });
      const batches = batchItems(
        candidates,
        TRIAGE_BATCH,
        (c) => c.title.length + c.description.length + c.site.length + 16,
      );
      const done = run.progress.triageBatches ?? 0;

      if (done < batches.length) {
        const chosen = await triageBatch(ctx, run.input.seed, batches[done], deps.generate);
        const picks: TriagePick[] = [
          ...(run.progress.picks ?? []),
          ...chosen.map((c) => ({ url: c.url, score: c.score })),
        ];
        await ctx.saveProgress({
          results: distinct,
          candidates: candidates.length,
          triageBatches: done + 1,
          picks,
        });
        if (done + 1 < batches.length) return false;
      }

      const seen = new Set<string>();
      const toRead = (ctx.run.progress.picks ?? [])
        .map((p, order) => ({ ...p, order }))
        .sort((a, b) => b.score - a.score || a.order - b.order)
        .filter((p) => !seen.has(p.url) && Boolean(seen.add(p.url)))
        .slice(0, limits.pagesToRead)
        .map((p) => p.url);
      await ctx.saveProgress({ results: distinct, candidates: candidates.length, toRead });
      return true;
    },
  };
}

/** Discover's steps so far, in order (match and score arrive in ticket 08). */
export function discoverSteps(deps: DiscoverDeps = {}): ResearchStep[] {
  return [searchStep(deps), triageStep(deps), fetchStep(deps), extractStep(deps)];
}

registerRunSteps("discover", discoverSteps());
