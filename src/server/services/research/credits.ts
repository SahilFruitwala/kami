import "@tanstack/react-start/server-only";
import { getDb } from "@/lib/db.server";
import { aiConfigured } from "@/lib/llm.server";
import { researchConfig, type ResearchConfig } from "@/lib/research-config.server.ts";
import {
  recentResearchCreditEntries,
  researchCreditBalance,
  settleRunCredits,
} from "@/lib/research-credits-db.server.ts";
import { chargedCredits, type ResearchCreditEntry } from "@/lib/research/credits.ts";
import type { RunRow } from "@/lib/research-db.server.ts";

/** Research config for this server, or null when Research is off. */
export function currentResearchConfig(): ResearchConfig | null {
  return researchConfig(process.env, aiConfigured());
}

export const researchConfigured = () => currentResearchConfig() !== null;

export type ResearchCreditsView = {
  enabled: boolean;
  balance: number;
  entries: ResearchCreditEntry[];
};

/** What the credits panel shows: the caller's own ledger, never the Firecrawl or model bills. */
export async function getResearchCredits(userId: string): Promise<ResearchCreditsView> {
  if (!researchConfigured()) return { enabled: false, balance: 0, entries: [] };
  const db = await getDb();
  const [balance, entries] = await Promise.all([
    researchCreditBalance(db, userId),
    recentResearchCreditEntries(db, userId, 20),
  ]);
  return { enabled: true, balance, entries };
}

/**
 * Charge a finished run from what it recorded (Firecrawl credits and model
 * tokens, the plan's included) and return the rest of its budget. Called on
 * every terminal state; a second call is a no-op.
 */
export async function settleRun(
  run: Pick<
    RunRow,
    "id" | "userId" | "budgetCredits" | "firecrawlCredits" | "tokensIn" | "tokensOut"
  >,
): Promise<number | null> {
  const tokensPerCredit = currentResearchConfig()?.tokensPerCredit;
  if (!tokensPerCredit) throw new Error("Research is not configured on this server.");
  const charged = chargedCredits(run, run.budgetCredits, tokensPerCredit);
  return settleRunCredits(await getDb(), run.userId, run.id, charged, "run ended");
}
