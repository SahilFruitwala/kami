/**
 * Research credit arithmetic (see GLOSSARY.md: Research credit). Pure: the
 * ledger rows come from `research_credit_entries`. Tested in
 * tests/research-credits.test.mjs.
 *
 * Every row is a signed number of credits:
 *   grant   (+) the operator adds credits
 *   reserve (−) a run starts and sets its whole budget aside
 *   release (+) the run ends; the part of its budget it didn't spend returns
 *
 * So the ledger's sum is what is available to start new runs, and what a
 * finished run cost is its reserve minus its release.
 */

import type { ResearchCreditKind } from "./kinds.ts";

export type ResearchCreditEntry = {
  id: string;
  kind: ResearchCreditKind;
  /** Signed credits: positive for grant/release, negative for reserve. */
  credits: number;
  note: string;
  runId: string | null;
  createdAt: number;
};

/** Model tokens per research credit when `RESEARCH_TOKENS_PER_CREDIT` is unset (tuned in ticket 09). */
export const DEFAULT_TOKENS_PER_CREDIT = 20_000;

export function availableCredits(entries: Array<Pick<ResearchCreditEntry, "credits">>): number {
  return entries.reduce((sum, e) => sum + e.credits, 0);
}

/** Whether a run with this budget can start. */
export function canReserveCredits(available: number, budget: number): boolean {
  return Number.isInteger(budget) && budget > 0 && available >= budget;
}

export type RunSpend = { firecrawlCredits: number; tokensIn: number; tokensOut: number };

/**
 * What a run costs: its Firecrawl credits plus its model tokens converted at
 * `tokensPerCredit`, rounded up, and never more than its budget (the run
 * stops before it would go over, so a higher number is a counting slip, not
 * a debt).
 */
export function chargedCredits(spend: RunSpend, budget: number, tokensPerCredit: number): number {
  const tokens = Math.max(0, spend.tokensIn) + Math.max(0, spend.tokensOut);
  const raw = Math.max(0, spend.firecrawlCredits) + Math.ceil(tokens / tokensPerCredit);
  return Math.min(Math.max(0, budget), raw);
}

/** The part of a run's budget that returns when it ends. */
export function unspentCredits(budget: number, charged: number): number {
  return Math.max(0, budget - Math.min(Math.max(0, charged), budget));
}
