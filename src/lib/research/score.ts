import type { CompetitionLabel, IdeaScore } from "./kinds.ts";

/**
 * The idea score, computed in code from an idea's evidence. A model never
 * scores an idea: it only labels single quotes (kind, sentiment, strong,
 * pays, names), and this turns those labels into five sub-scores (each 0–1)
 * and a weighted total. Competition is a label, not in the total, because
 * named products can count for an idea (people already pay) or against it.
 * Tested in tests/research-score.test.mjs.
 */

export type ScoredEvidence = {
  authorKey: string | null;
  site: string;
  sourceId: string;
  sentiment: number;
  strong: boolean;
  pays: boolean;
  names: string[];
  postedAt: Date | null;
};

/**
 * Weights of the total, tuned in ticket 09 on real seeds: support (how many
 * people, how widely) leads, so an idea several people raise ranks above one
 * strongly felt quote. Were 0.25 / 0.15 / 0.25 / 0.25 / 0.1.
 */
export const SCORE_WEIGHTS = {
  frequency: 0.35,
  spread: 0.2,
  intensity: 0.15,
  pays: 0.2,
  recency: 0.1,
} as const;

/**
 * Share-based sub-scores (intensity, recency) count this many average quotes
 * on top of an idea's own, so one quote can't score as much as ten saying
 * the same.
 */
const PRIOR_QUOTES = 3;
const INTENSITY_PRIOR = 0.25;
const RECENCY_PRIOR = 0.5;

/** A share of `n` quotes pulled toward `prior` while `n` is small. */
const shrunk = (sum: number, n: number, prior: number) =>
  (sum + prior * PRIOR_QUOTES) / (n + PRIOR_QUOTES);

/** Distinct authors at which frequency tops out. */
const FREQUENCY_CAP = 30;
/** Quotes about paying at which willingness to pay tops out. */
const PAYS_CAP = 5;
/** A quote's recency weight halves every this many days. */
const RECENCY_HALF_LIFE_DAYS = 180;

const round = (n: number) => Math.round(n * 1000) / 1000;
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** Distinct people: each author once; quotes with no known author count half each. */
export function frequencyScore(evidence: ScoredEvidence[]): number {
  const authors = new Set(evidence.map((e) => e.authorKey).filter(Boolean));
  const anonymous = evidence.filter((e) => !e.authorKey).length;
  const people = authors.size + anonymous * 0.5;
  return clamp01(Math.log2(1 + people) / Math.log2(1 + FREQUENCY_CAP));
}

/** How widely it comes up: different sites matter most, then different pages. */
export function spreadScore(evidence: ScoredEvidence[]): number {
  if (!evidence.length) return 0;
  const sites = new Set(evidence.map((e) => e.site)).size;
  const sources = new Set(evidence.map((e) => e.sourceId)).size;
  return clamp01(Math.min(1, (sites - 1) / 4) * 0.6 + Math.min(1, sources / 10) * 0.4);
}

/** Share of quotes that are strongly felt or very negative, pulled toward 0.25 while few. */
export function intensityScore(evidence: ScoredEvidence[]): number {
  if (!evidence.length) return 0;
  const felt = evidence.filter((e) => e.strong || e.sentiment <= -2).length;
  return shrunk(felt, evidence.length, INTENSITY_PRIOR);
}

export function paysScore(evidence: ScoredEvidence[]): number {
  return clamp01(evidence.filter((e) => e.pays).length / PAYS_CAP);
}

/** Mean recency weight of dated quotes, pulled toward 0.5 (unknown, not old) while few. */
export function recencyScore(evidence: ScoredEvidence[], now: number): number {
  const dated = evidence.filter((e) => e.postedAt);
  const weights = dated.map((e) => {
    const ageDays = Math.max(0, (now - (e.postedAt as Date).getTime()) / 86_400_000);
    return 0.5 ** (ageDays / RECENCY_HALF_LIFE_DAYS);
  });
  return shrunk(
    weights.reduce((a, b) => a + b, 0),
    dated.length,
    RECENCY_PRIOR,
  );
}

/**
 * Who else is in the space, from products named in the idea's quotes: none,
 * some (1–2), crowded (3+), or crowded but disliked (3+ and at least half of
 * the quotes naming them are negative: a gap among tools people don't like).
 */
export function competitionLabel(evidence: ScoredEvidence[]): CompetitionLabel {
  const naming = evidence.filter((e) => e.names.length);
  const products = new Set(naming.flatMap((e) => e.names.map((n) => n.toLowerCase())));
  if (products.size === 0) return "none";
  if (products.size < 3) return "some";
  const negative = naming.filter((e) => e.sentiment < 0).length;
  return negative * 2 >= naming.length ? "crowded_disliked" : "crowded";
}

export function scoreIdea(evidence: ScoredEvidence[], now: number): IdeaScore {
  const frequency = round(frequencyScore(evidence));
  const spread = round(spreadScore(evidence));
  const intensity = round(intensityScore(evidence));
  const pays = round(paysScore(evidence));
  const recency = round(recencyScore(evidence, now));
  const total = round(
    SCORE_WEIGHTS.frequency * frequency +
      SCORE_WEIGHTS.spread * spread +
      SCORE_WEIGHTS.intensity * intensity +
      SCORE_WEIGHTS.pays * pays +
      SCORE_WEIGHTS.recency * recency,
  );
  return {
    frequency,
    spread,
    intensity,
    pays,
    recency,
    competition: competitionLabel(evidence),
    total,
  };
}
