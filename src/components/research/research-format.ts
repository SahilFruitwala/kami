import type { CompetitionLabel, IdeaScore } from "@/lib/research/kinds.ts";

/** Labels and formatting shared by the Research pages. */

const DAY = 86_400_000;

/** "today", "yesterday", "3 days ago", else the date. */
export function relativeDay(at: number | null, now = Date.now()): string {
  if (!at) return "never";
  const days = Math.floor((now - at) / DAY);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return new Date(at).toLocaleDateString();
}

const STATE_LABEL: Record<string, string> = {
  drafting: "Drafting plan",
  awaiting_plan: "Plan ready",
  queued: "Starting",
  running: "Running",
  done: "Done",
  stopped: "Stopped",
  failed: "Failed",
};

export function runStateLabel(state: string, stopReason?: string | null, started = true): string {
  if (state === "stopped" && !started) return "Plan discarded";
  if (state === "stopped" && stopReason === "budget") return "Stopped at budget";
  if (state === "stopped" && stopReason === "user") return "Stopped by you";
  return STATE_LABEL[state] ?? state;
}

export const SUB_SCORES: Array<{
  key: keyof Omit<IdeaScore, "competition" | "total">;
  label: string;
}> = [
  { key: "frequency", label: "People" },
  { key: "spread", label: "Spread" },
  { key: "intensity", label: "Intensity" },
  { key: "pays", label: "Would pay" },
  { key: "recency", label: "Recent" },
];

export const COMPETITION_LABEL: Record<CompetitionLabel, string> = {
  none: "No tools named",
  some: "A few tools",
  crowded: "Crowded",
  crowded_disliked: "Crowded, disliked",
};
