import { DEPTH_LIMITS } from "./discover.ts";
import type { Depth, PlanQuery } from "./kinds.ts";
import type { RunKind } from "./kinds.ts";
import { FILL_CREDITS, FILL_LIMITS } from "./players.ts";
import { runBudget } from "./run-engine.ts";

/**
 * What a run should cost, before it starts. Pure, so the plan screen
 * recomputes it as the plan is edited and the server reports the same
 * numbers. Tested in tests/research-estimate.test.mjs.
 */

/** What Firecrawl bills for a search returning `results` results: 2 credits per 10, rounded up. */
export function searchCreditCost(results: number): number {
  return results > 0 ? 2 * Math.ceil(results / 10) : 0;
}

/** What Firecrawl bills for one scrape without paid extras (no PDF parsing, no stealth proxy). */
export const SCRAPE_CREDIT_COST = 1;

/** Hacker News searches go through its free API. */
const FREE_SEARCH_SITES = new Set(["news.ycombinator.com"]);

/** Model tokens a run spends, in research credits, measured on real runs (ticket 09). */
const TOKEN_CREDITS: Record<Depth, [number, number]> = { quick: [2, 6], deep: [5, 12] };

export type RunEstimate = { low: number; high: number; budget: number };

/**
 * Paid searches, then pages, then tokens, never above the depth's budget
 * (the most a run can spend). At the low end, searches the topic already
 * sent (`repeat`, reused for free within 14 days) and half the pages (the
 * page cache) cost nothing. Map a space adds its Player fills, half of them
 * at the low end.
 */
export function estimateRun(
  plan: PlanQuery[],
  depth: Depth,
  kind: RunKind = "discover",
): RunEstimate {
  const limits = DEPTH_LIMITS[depth];
  const budget = runBudget(kind, depth);
  const fills = kind === "explore" ? FILL_LIMITS[depth] * FILL_CREDITS : 0;
  const paid = plan.filter((q) => q.checked !== false && !FREE_SEARCH_SITES.has(q.site ?? ""));
  const perSearch = searchCreditCost(limits.resultsPerQuery);
  const pages = limits.pagesToRead * SCRAPE_CREDIT_COST;
  const [tokLow, tokHigh] = TOKEN_CREDITS[depth];
  const fresh = paid.filter((q) => !q.repeat).length;
  return {
    low: Math.min(
      budget,
      fresh * perSearch + Math.round(pages / 2) + Math.round(fills / 2) + tokLow,
    ),
    high: Math.min(budget, paid.length * perSearch + pages + fills + tokHigh),
    budget,
  };
}
