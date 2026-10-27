import "@tanstack/react-start/server-only";
import { z } from "zod";
import { getDb } from "@/lib/db.server";
import { redditConfigured } from "@/lib/reddit.server.ts";
import {
  liveIdeaTitles,
  recentTopicQueries,
  runQueries,
  topicQueryNorms,
  type RunRow,
  type TopicRow,
} from "@/lib/research-db.server.ts";
import {
  countTopicPlayers,
  setPlayerUrl,
  unfilledPlayers,
  updatePlayerFill,
} from "@/lib/research-players-db.server.ts";
import type { RunSpend } from "@/lib/research/credits.ts";
import { OPEN_WEB, PLAN_INTENTS, planSite, validatePlan } from "@/lib/research/discover.ts";
import type { PlanQuery, SearchHit } from "@/lib/research/kinds.ts";
import {
  EMPTY_PRICING,
  mergeExploreQueries,
  pickHomepage,
  pricingPageUrl,
  type PlayerPricing,
} from "@/lib/research/players.ts";
import { asDocument } from "@/server/ai";
import { gatherSteps, type DiscoverDeps } from "./discover";
import { getOrFetchSource } from "./fetch";
import { callModel, type Generate } from "./models";
import {
  RunStepError,
  registerRunSteps,
  type DraftResult,
  type Meter,
  type ResearchStep,
} from "./runs";

/**
 * Explore: map the products already in a space. The plan searches for "best
 * X tools", alternatives and directories; extract turns named products into
 * Players; then a fill step fetches each homepage and pricing page and a
 * worker fills fields from those pages only (spec §5.3).
 */

export const EXPLORE_PLAN_PROMPT_VERSION = "explore-plan-v1";
export const EXPLORE_FILL_PROMPT_VERSION = "explore-fill-v1";

export type ExploreDeps = DiscoverDeps;

const planSchema = z.object({
  queries: z
    .array(
      z.object({
        query: z.string(),
        site: z.string().catch(OPEN_WEB),
        intent: z.enum(PLAN_INTENTS).catch("alternatives"),
      }),
    )
    .max(40),
});

const PLAN_INSTRUCTIONS = `You plan web searches that find the products already in a space: "best X tools" lists, alternatives pages, and software directories, plus each product's own site when you know it.

Write short queries. Every query must say where to search in "site":
- producthunt.com, g2.com, capterra.com, news.ycombinator.com, reddit.com, indiehackers.com, or "web".
Spread the queries over at least three sites. Put only the host in "site".
intent is usually alternatives; use pricing when looking for what they charge.

You MUST include searches for: "best … tools", "… alternatives", and a software directory.`;

const fillSchema = z.object({
  one_liner: z.string().catch(""),
  category: z.string().catch(""),
  audience: z.string().catch(""),
  plans: z
    .array(z.object({ name: z.string(), price: z.string().catch("") }))
    .max(12)
    .catch([]),
  free_plan: z.boolean().catch(false),
});

const FILL_INSTRUCTIONS = `You fill in a product from ONLY the homepage and pricing page text given. If a field isn't on those pages, leave it empty or false. Never invent a URL, price, audience or category.

- one_liner: one short sentence of what it is
- category: a short product category (e.g. "video editor")
- audience: who it's for, if the pages say
- plans: named plans and the price text as written on the page
- free_plan: true only if the pages say there is a free plan`;

function planFromModel(
  output: z.output<typeof planSchema>,
  run: Pick<RunRow, "input" | "depth">,
  sent: ReadonlySet<string>,
): PlanQuery[] {
  const drafted = validatePlan(
    output.queries.map((q, i) => ({
      id: `q${i + 1}`,
      query: q.query,
      site: planSite(q.site),
      intent: q.intent,
    })),
    run.input,
    run.depth,
    sent,
    "draft",
  );
  return mergeExploreQueries(drafted, run.input.seed, run.depth);
}

/** One writer-tier call plus the required Explore searches, no Firecrawl. */
export function exploreDrafter(deps: ExploreDeps = {}) {
  return async (run: RunRow, topic: TopicRow): Promise<DraftResult> => {
    const db = await getDb();
    const [sent, ideas, recent] = await Promise.all([
      topicQueryNorms(db, topic.id),
      liveIdeaTitles(db, topic.id, 50),
      recentTopicQueries(db, topic.id, 50),
    ]);
    const spend = { tokensIn: 0, tokensOut: 0 };
    const meter: Meter = {
      ensureBudget: () => {},
      recordSpend: async (s: Partial<RunSpend>) => {
        spend.tokensIn += s.tokensIn ?? 0;
        spend.tokensOut += s.tokensOut ?? 0;
      },
    };
    const prompt = [
      `Space: ${run.input.seed}`,
      ideas.length
        ? `Ideas this topic already has:\n${asDocument(ideas.map((t) => `- ${t}`).join("\n"))}`
        : "",
      recent.length ? `Already searched:\n${recent.map((q) => `- ${q}`).join("\n")}` : "",
      "Include searches for best tools, alternatives, and a software directory.",
    ]
      .filter(Boolean)
      .join("\n\n");
    const output = await callModel(
      meter,
      {
        tier: "writer",
        schema: planSchema,
        promptVersion: EXPLORE_PLAN_PROMPT_VERSION,
        instructions: PLAN_INSTRUCTIONS,
        prompt,
        maxOutputTokens: 1_500,
        temperature: 0.4,
      },
      deps.generate,
    );
    const plan = planFromModel(output, run, sent).filter(
      (q) => redditConfigured() || q.site !== "reddit.com",
    );
    if (!plan.some((q) => q.checked)) {
      throw new RunStepError("Couldn't draft searches for that space. Try wording it differently.");
    }
    return { plan, ...spend };
  };
}

async function runHits(runId: string): Promise<SearchHit[]> {
  const queries = await runQueries(await getDb(), runId);
  const seen = new Set<string>();
  const hits: SearchHit[] = [];
  for (const q of queries) {
    for (const h of q.hits) {
      if (seen.has(h.url)) continue;
      seen.add(h.url);
      hits.push(h);
    }
  }
  return hits;
}

/**
 * `fill` (final): one unit per Player that still has no fetched pages. Finds
 * a homepage in this run's search hits, reads homepage + /pricing, then a
 * worker fills fields from those pages only. Idempotent: already-filled
 * Players are skipped.
 */
export function fillPlayersStep(deps: ExploreDeps = {}): ResearchStep {
  return {
    name: "fill",
    final: true,
    unitBudgetMs: 150_000,
    async work(ctx) {
      const db = await getDb();
      const doneIds = ctx.run.progress.filledIds ?? [];
      const pending = (await unfilledPlayers(db, ctx.run.topicId)).filter(
        (p) => !doneIds.includes(p.id),
      );
      const next = pending[0];
      if (!next) {
        await ctx.saveProgress({ players: await countTopicPlayers(db, ctx.run.topicId) });
        return true;
      }
      const hits = await runHits(ctx.run.id);
      const home = next.url || pickHomepage(hits, next.name);
      if (!home) {
        // No official page in this run's hits: leave fields empty (they must
        // trace to a page) and don't retry this Player in this run.
        await ctx.saveProgress({
          players: await countTopicPlayers(db, ctx.run.topicId),
          filled: (ctx.run.progress.filled ?? 0) + 1,
          filledIds: [...doneIds, next.id],
        });
        return pending.length <= 1;
      }
      if (!next.url) await setPlayerUrl(db, next.id, home);

      const sourceIds: string[] = [];
      const pages: Array<{ kind: string; markdown: string }> = [];
      for (const url of [home, pricingPageUrl(home)].filter((u): u is string => Boolean(u))) {
        try {
          const { source } = await getOrFetchSource(
            ctx,
            {
              userId: ctx.run.userId,
              topicId: ctx.run.topicId,
              runId: ctx.run.id,
              url,
              addedBy: "search",
              maxPageChars: ctx.config.maxPageChars,
            },
            deps.calls,
          );
          sourceIds.push(source.id);
          pages.push({ kind: source.kind, markdown: source.markdown.slice(0, 12_000) });
        } catch {
          // A page we can't read is skipped; fields still only come from what we got.
        }
      }

      let oneLiner = "";
      let category = "";
      let audience = "";
      let pricing: PlayerPricing = EMPTY_PRICING;
      let freePlan = false;
      if (pages.length) {
        const output = await callModel(
          ctx,
          {
            tier: "worker",
            schema: fillSchema,
            promptVersion: EXPLORE_FILL_PROMPT_VERSION,
            instructions: FILL_INSTRUCTIONS,
            prompt: [
              `Product: ${next.name}`,
              ...pages.map((p) => `${p.kind} page:\n${asDocument(p.markdown)}`),
            ].join("\n\n"),
            maxOutputTokens: 800,
            temperature: 0,
          },
          deps.generate,
        );
        oneLiner = output.one_liner.replace(/\s+/g, " ").trim().slice(0, 200);
        category = output.category.replace(/\s+/g, " ").trim().slice(0, 80);
        audience = output.audience.replace(/\s+/g, " ").trim().slice(0, 80);
        pricing = {
          plans: output.plans
            .map((p) => ({
              name: p.name.replace(/\s+/g, " ").trim().slice(0, 80),
              price: p.price.replace(/\s+/g, " ").trim().slice(0, 80),
            }))
            .filter((p) => p.name),
        };
        freePlan = Boolean(output.free_plan);
      }

      await updatePlayerFill(db, next.id, {
        url: home,
        category,
        oneLiner,
        audience,
        pricing,
        freePlan,
        sourceIds,
      });
      await ctx.saveProgress({
        players: await countTopicPlayers(db, ctx.run.topicId),
        filled: (ctx.run.progress.filled ?? 0) + 1,
        filledIds: [...doneIds, next.id],
      });
      return pending.length <= 1;
    },
  };
}

export function exploreSteps(deps: ExploreDeps = {}): ResearchStep[] {
  return [...gatherSteps(deps), fillPlayersStep(deps)];
}

registerRunSteps("explore", exploreSteps());
