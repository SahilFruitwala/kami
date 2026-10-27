/**
 * The fixed vocabularies of Research rows. Each list is mirrored by a CHECK
 * constraint in migrations/0023_research.sql; change both together.
 * Terms are defined in GLOSSARY.md (Research).
 */

/** grant (+, the operator adds credits), reserve (−, a run sets its budget aside), release (+, the unspent part returns). */
export const RESEARCH_CREDIT_KINDS = ["grant", "reserve", "release"] as const;
export type ResearchCreditKind = (typeof RESEARCH_CREDIT_KINDS)[number];

/** v1 builds `discover`; the others arrive with Validate, questions and Explore. */
export const RUN_KINDS = ["discover", "validate", "question", "explore"] as const;
export type RunKind = (typeof RUN_KINDS)[number];

export const RUN_STATES = [
  "drafting",
  "awaiting_plan",
  "queued",
  "running",
  "done",
  "stopped",
  "failed",
] as const;
export type RunState = (typeof RUN_STATES)[number];

/** Why a run ended `stopped` (or `failed`, with `error`). */
export const RUN_STOP_REASONS = ["budget", "user", "error"] as const;
export type RunStopReason = (typeof RUN_STOP_REASONS)[number];

export const DEPTHS = ["quick", "deep"] as const;
export type Depth = (typeof DEPTHS)[number];

/** Decides how long a stored source stays fresh. */
export const SOURCE_KINDS = [
  "thread",
  "review",
  "pricing",
  "homepage",
  "article",
  "other",
] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

/** search: found by a run; link: pasted by the user. */
export const SOURCE_ORIGINS = ["search", "link"] as const;
export type SourceOrigin = (typeof SOURCE_ORIGINS)[number];

export const EVIDENCE_KINDS = [
  "pain",
  "request",
  "workaround",
  "price",
  "competitor",
  "stat",
  "opinion",
] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

/** Only these kinds are matched into ideas. */
export const IDEA_EVIDENCE_KINDS: ReadonlySet<EvidenceKind> = new Set([
  "pain",
  "request",
  "workaround",
]);

/** exact: the quote is in the source as written; close: near-identical, stored in the source's wording. */
export const EVIDENCE_MATCHES = ["exact", "close"] as const;
export type EvidenceMatch = (typeof EVIDENCE_MATCHES)[number];

export const IDEA_STATUSES = ["open", "starred", "dismissed", "merged"] as const;
export type IdeaStatus = (typeof IDEA_STATUSES)[number];

/** user: renamed by hand, never renamed by a run again. */
export const IDEA_NAMERS = ["model", "user"] as const;
export type IdeaNamer = (typeof IDEA_NAMERS)[number];

/** validate: a cited report on an idea; question: a free-form cited answer (ticket 16). */
export const REPORT_KINDS = ["validate", "question"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

export type CompetitionLabel = "none" | "some" | "crowded" | "crowded_disliked";

/** Sub-scores are 0–1; `total` is their weighted sum (competition is a label, not in the total). */
export type IdeaScore = {
  frequency: number;
  spread: number;
  intensity: number;
  pays: number;
  recency: number;
  competition: CompetitionLabel;
  total: number;
};

/** What a Discover run is started from. */
export type DiscoverInput = {
  seed: string;
  audience?: "b2b" | "b2c" | "any";
  includeSites?: string[];
  excludeSites?: string[];
  sinceMonths?: number;
  /** A pasted link (spec §4.11): the run reads only this page, with no plan. */
  link?: string;
  /** Validate (ticket 15): the idea this run is checking. */
  ideaId?: string;
  /** Ask a question (ticket 16). */
  question?: string;
};

/** One search the run will make. `intent` steers what kind of talk it looks for. */
export type PlanQuery = {
  id: string;
  query: string;
  site?: string;
  intent: "pain" | "wish" | "switching" | "alternatives" | "pricing";
  /** Unchecked queries stay in the plan but are not searched. */
  checked: boolean;
  /** Set on a query this topic has already sent; it starts unchecked. */
  repeat?: boolean;
  /** Required counter-evidence search on a Validate plan. */
  counter?: boolean;
};

/** One search result as stored with its query. */
export type SearchHit = { url: string; title: string; description: string };

/** A search result triage chose to read, with its code score (higher reads first). */
export type TriagePick = { url: string; score: number };

/** Live counters for the run view; every field is optional so steps fill in their own. */
export type RunProgress = {
  /** Checked queries sent so far, of `queries`, and how many reused a topic's stored results. */
  searched?: number;
  reusedSearches?: number;
  queries?: number;
  /** Distinct new results across all searches. */
  results?: number;
  /** Results that passed the code filter and went to triage. */
  candidates?: number;
  /** Triage batches finished, and the picks so far. */
  triageBatches?: number;
  picks?: TriagePick[];
  /** The pages the fetch step will read, best first. */
  toRead?: string[];
  /** The next-best picks, best first; one moves into `toRead` for each page skipped. */
  spares?: string[];
  /** Pages of `toRead` now stored, and pages that couldn't be read (skipped, never retried). */
  read?: number;
  failed?: number;
  skippedUrls?: string[];
  /** Extraction batches finished; quotes kept (checked against their page) and dropped. */
  extractBatches?: number;
  quotes?: number;
  dropped?: number;
  /** Matching batches finished; whether new ideas were renamed by the writer. */
  matchBatches?: number;
  named?: boolean;
  /** Ideas this run created, and ideas it added evidence to (new ones included). */
  ideasNew?: number;
  ideasTouched?: number;
  /** Validate/question: the report has been written. */
  reported?: boolean;
  stopRequested?: boolean;
};
