import "@tanstack/react-start/server-only";
import { z } from "zod";
import { getDb } from "@/lib/db.server";
import { PageReadError } from "@/lib/page-read-error.ts";
import { redditConfigured } from "@/lib/reddit.server.ts";
import {
  recentTopicQueries,
  topicQueryNorms,
  type RunRow,
  type TopicRow,
} from "@/lib/research-db.server.ts";
import {
  playerCategories,
  playersToFill,
  savePlayerFill,
  setPlayerUrl,
  unfilledPlayerCount,
  type PlayerFill,
  type PlayerRow,
} from "@/lib/research-players-db.server.ts";
import type { RunSpend } from "@/lib/research/credits.ts";
import { DEPTH_LIMITS } from "@/lib/research/discover.ts";
import {
  FILL_LIMITS,
  PLAYER_AUDIENCES,
  checkPricing,
  pickHomepage,
  pricingUrl,
} from "@/lib/research/players.ts";
import { asDocument } from "@/server/ai";
import { FATAL_FIRECRAWL, extractStep, fetchStep, type StepDeps } from "./evidence";
import {
  PLAN_INSTRUCTIONS,
  planFromModel,
  planSchema,
  searchStep,
  triageStep,
  type DiscoverDeps,
} from "./discover";
import { getOrFetchSource, searchForRun } from "./fetch";
import { callModel } from "./models";
import { playersStep } from "./players";
import {
  RunStepError,
  registerRunSteps,
  type DraftResult,
  type Meter,
  type ResearchStep,
  type StepContext,
} from "./runs";

/**
 * Explore (spec §5.3): map the products already in a space. The run searches
 * for roundups, alternatives and directory pages, reads them for the products
 * they name, notes each as a Player (./players), then fills in the best-known
 * Players from their own homepage and pricing page. A Player's fields come
 * from those pages only, and every price must appear on the pricing page.
 */

export const EXPLORE_PLAN_PROMPT_VERSION = "explore-plan-v1";
export const PLAYER_PROMPT_VERSION = "explore-player-v2";

const EXPLORE_PLAN_INSTRUCTIONS = `${PLAN_INSTRUCTIONS}

This plan maps who is already in a space, not what people complain about. Write queries that find lists and comparisons of the products: "best <category> tools", "<known product> alternatives", "<category> software comparison", "top <category> apps", plus directory and review pages on g2.com, capterra.com, producthunt.com and alternativeto.net, and discussions where people ask which tool to use. Use intent "alternatives" for most and "pricing" for a few; do not use "counter".`;

/** The drafter `draftRun` calls for an Explore run: a writer-tier plan, no Firecrawl, nothing reserved. */
export function exploreDrafter(deps: DiscoverDeps = {}) {
  return async (run: RunRow, topic: TopicRow): Promise<DraftResult> => {
    const db = await getDb();
    const [sent, recent] = await Promise.all([
      topicQueryNorms(db, topic.id),
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
    const input = run.input;
    const limits = DEPTH_LIMITS[run.depth];
    const never = [...(input.excludeSites ?? []), ...(redditConfigured() ? [] : ["reddit.com"])];
    const prompt = [
      `Space to map: ${input.seed}`,
      input.audience && input.audience !== "any" ? `Audience: ${input.audience.toUpperCase()}` : "",
      input.includeSites?.length ? `Only these sites: ${input.includeSites.join(", ")}` : "",
      never.length ? `Never these sites: ${never.join(", ")}` : "",
      `Write ${limits.maxQueries} queries.`,
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
        promptVersion: EXPLORE_PLAN_PROMPT_VERSION,
        instructions: EXPLORE_PLAN_INSTRUCTIONS,
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

// ---------- Fill ----------

const playerSchema = z.object({
  oneLiner: z.string().nullish(),
  category: z.string().nullish(),
  audience: z.enum(PLAYER_AUDIENCES).nullish().catch(null),
  freePlan: z.boolean().nullish().catch(null),
  plans: z
    .array(z.object({ name: z.string(), price: z.string().catch("") }))
    .max(8)
    .catch([]),
});

const PLAYER_INSTRUCTIONS = `You describe one software product from its own homepage and pricing page, which are in <document> blocks. Use only what those pages say; if a page doesn't say, leave the field empty.

Give:
- oneLiner: what it is and who it is for, in one plain sentence under 140 characters, without hype.
- category: a short label (1 to 3 words) for the kind of product, e.g. "Podcast editor". Reuse one of the existing categories when it fits.
- audience: "b2b" (sold to businesses or teams), "b2c" (sold to individuals) or "both".
- freePlan: true if the pages mention a free plan or free tier, false if they say there is none, otherwise leave empty.
- plans: each plan on the pricing page, with BOTH a name and its price exactly as written there (e.g. "$12 per seat per month"; "Free" for a free plan). Never give a plan without its price: leave out plans whose price isn't shown. Leave empty when there is no pricing page.`;

/** Characters of each page the player call reads. */
const HOMEPAGE_CHARS = 3_000;
const PRICING_CHARS = 5_000;

/** Pages that can't be read are skipped; failures that would fail every page stop the run. */
function skipOrThrow(err: unknown): void {
  if (!(err instanceof PageReadError)) throw err;
  if (err.status === 429 || FATAL_FIRECRAWL.test(err.message)) throw new RunStepError(err.message);
}

async function fillPlayer(ctx: StepContext, player: PlayerRow, deps: StepDeps): Promise<void> {
  const db = await getDb();
  const { run } = ctx;
  const none: PlayerFill = {
    url: player.url,
    category: null,
    oneLiner: null,
    audience: null,
    pricing: null,
    freePlan: null,
    sourceIds: [],
  };

  let origin = player.url;
  if (!origin) {
    const hits = await searchForRun(
      ctx,
      { query: `${player.name} official site` },
      3,
      {},
      deps.calls,
    );
    origin = pickHomepage(player.name, hits);
    if (!origin) return savePlayerFill(db, player.id, none);
    await setPlayerUrl(db, player.id, origin);
  }

  const request = {
    userId: run.userId,
    topicId: run.topicId,
    runId: run.id,
    addedBy: "search" as const,
    maxPageChars: ctx.config.maxPageChars,
  };
  const pages: Array<{ label: string; markdown: string; id: string }> = [];
  for (const [label, url] of [
    ["homepage", origin],
    ["pricing", pricingUrl(origin)],
  ] as const) {
    try {
      const { source } = await getOrFetchSource(ctx, { ...request, url }, deps.calls);
      pages.push({ label, markdown: source.markdown, id: source.id });
    } catch (err) {
      skipOrThrow(err);
    }
  }
  if (!pages.length) return savePlayerFill(db, player.id, { ...none, url: origin });

  const categories = await playerCategories(db, run.topicId);
  const blocks = pages
    .map((p) =>
      asDocument(p.markdown.slice(0, p.label === "pricing" ? PRICING_CHARS : HOMEPAGE_CHARS), {
        page: p.label,
      }),
    )
    .join("\n\n");
  const output = await callModel(
    ctx,
    {
      tier: "worker",
      schema: playerSchema,
      promptVersion: PLAYER_PROMPT_VERSION,
      instructions: PLAYER_INSTRUCTIONS,
      prompt: [
        `Product: ${player.name}`,
        categories.length ? `Existing categories: ${categories.join("; ")}` : "",
        blocks,
      ]
        .filter(Boolean)
        .join("\n\n"),
      maxOutputTokens: 600,
      temperature: 0,
    },
    deps.generate,
  );

  const pricingPage = pages.find((p) => p.label === "pricing");
  const plans = pricingPage ? checkPricing(output.plans, pricingPage.markdown) : [];
  const everything = pages
    .map((p) => p.markdown)
    .join("\n")
    .toLowerCase();
  await savePlayerFill(db, player.id, {
    url: origin,
    category: output.category?.replace(/\s+/g, " ").trim().slice(0, 40) || null,
    oneLiner: output.oneLiner?.replace(/\s+/g, " ").trim().slice(0, 160) || null,
    audience: output.audience ?? null,
    pricing: plans.length ? { plans } : null,
    // "Free plan" must be on a page; a model's guess isn't enough.
    freePlan:
      output.freePlan === true
        ? everything.includes("free")
          ? true
          : null
        : (output.freePlan ?? null),
    sourceIds: pages.map((p) => p.id),
  });
}

/**
 * `fill`: one Player per unit, best known first, up to `FILL_LIMITS` per run.
 * Players already filled (by an earlier run) are skipped, and one that was
 * looked up but not found is never looked up again.
 */
export function fillStep(deps: StepDeps): ResearchStep {
  return {
    name: "fill",
    // A search, two page reads, a model call, and rate-limit waits.
    unitBudgetMs: 180_000,
    async work(ctx) {
      const db = await getDb();
      const { run } = ctx;
      const cap = FILL_LIMITS[run.depth];
      const done = run.progress.playersFilled ?? 0;
      if (run.progress.playersTotal === undefined) {
        await ctx.saveProgress({
          playersTotal: Math.min(cap, await unfilledPlayerCount(db, run.topicId)),
        });
      }
      if (done >= cap) return true;
      const [next] = await playersToFill(db, run.topicId, 1);
      if (!next) return true;
      await fillPlayer(ctx, next, deps);
      await ctx.saveProgress({ playersFilled: done + 1 });
      return done + 1 >= cap;
    },
  };
}

/** Explore's steps, in order. */
export function exploreSteps(deps: DiscoverDeps = {}): ResearchStep[] {
  return [
    searchStep(deps),
    triageStep(deps, "explore"),
    fetchStep(deps),
    extractStep(deps, "explore"),
    playersStep(),
    fillStep(deps),
  ];
}

registerRunSteps("explore", exploreSteps());
