import type { Depth, DiscoverInput, PlanQuery, SearchHit } from "./kinds.ts";
import { inferSourceKind, isReadableUrl, siteOf, urlKey } from "./sources.ts";

/**
 * Discover's pure rules: how big a run is at each depth, what a valid plan
 * is (and which of its queries this topic has already sent), and the code
 * filter that screens and ranks search results before any model sees them.
 * Tested in tests/research-discover.test.mjs.
 */

export type DepthLimits = {
  /** Most queries a plan may hold. */
  maxQueries: number;
  /** Results asked for per query (Firecrawl bills 2 credits per 10). */
  resultsPerQuery: number;
  /** Pages the fetch step reads. */
  pagesToRead: number;
  /** Most results sent to triage; the rest are cut by code score first. */
  maxCandidates: number;
};

/** _(start values, tuned in ticket 09)_ */
export const DEPTH_LIMITS: Record<Depth, DepthLimits> = {
  quick: { maxQueries: 12, resultsPerQuery: 10, pagesToRead: 12, maxCandidates: 40 },
  deep: { maxQueries: 20, resultsPerQuery: 10, pagesToRead: 40, maxCandidates: 120 },
};

export const MAX_QUERY_CHARS = 200;

/** A topic's stored search results are reused for the same query this long, for free _(start value)_. */
export const SEARCH_REUSE_DAYS = 14;

export const PLAN_INTENTS = ["pain", "wish", "switching", "alternatives", "pricing"] as const;

/** A site filter as a bare host: no scheme, no `www.`, no path, lowercase. */
export function normalizeSite(raw: string): string | null {
  const text = raw.trim().toLowerCase();
  if (!text) return null;
  const site = siteOf(/^[a-z]+:\/\//.test(text) ? text : `https://${text}`);
  return site && /^[a-z0-9.-]+\.[a-z]{2,}$/.test(site) ? site : null;
}

/** What a plan's "site" says for "no site": search the open web. */
export const OPEN_WEB = "web";

/**
 * A planned site as `validatePlan` takes it: undefined for the open web
 * ("web", "any", "none", empty), otherwise the host as given (validatePlan
 * normalises it, and drops it if it isn't one).
 */
export function planSite(raw: string | null | undefined): string | undefined {
  const text = raw?.trim().toLowerCase() ?? "";
  return !text || ["web", "any", "none", "open web", "all"].includes(text)
    ? undefined
    : raw?.trim();
}

/** The text actually searched: the query, plus `site:` when the plan targets one. */
export function searchText(q: Pick<PlanQuery, "query" | "site">): string {
  return q.site ? `${q.query} site:${q.site}` : q.query;
}

/** Lowercase, collapsed whitespace: how repeats are recognised across runs. */
export function normalizeQuery(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/** A query or a site belongs to a filter list when it is the site or a subdomain of it. */
function onSite(site: string, list: string[]): boolean {
  return list.some((s) => site === s || site.endsWith(`.${s}`));
}

/**
 * Clean a plan (drafted or edited) against the run's filters and depth:
 * trims and caps each query, normalises sites, drops excluded sites (and,
 * when `includeSites` is given, other sites), drops duplicates, keeps at most
 * `maxQueries`. A query this topic already sent is marked `repeat` and, in a
 * fresh draft, starts unchecked; an edited plan keeps the user's choice.
 */
export function validatePlan(
  plan: Array<Partial<PlanQuery>>,
  input: DiscoverInput,
  depth: Depth,
  sent: ReadonlySet<string>,
  mode: "draft" | "edited",
): PlanQuery[] {
  const include = (input.includeSites ?? []).map(normalizeSite).filter((s): s is string => !!s);
  const exclude = (input.excludeSites ?? []).map(normalizeSite).filter((s): s is string => !!s);
  const seen = new Set<string>();
  const out: PlanQuery[] = [];
  for (const [i, raw] of plan.entries()) {
    const query = (raw.query ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_QUERY_CHARS).trim();
    if (!query) continue;
    // A site written into the query text counts as the query's site.
    const inline = query.match(/\bsite:(\S+)/i);
    const site = normalizeSite(raw.site ?? inline?.[1] ?? "") ?? undefined;
    const text = inline ? query.replace(/\s*\bsite:\S+/i, "").trim() : query;
    if (!text) continue;
    if (site && onSite(site, exclude)) continue;
    if (site && include.length && !onSite(site, include)) continue;
    const norm = normalizeQuery(searchText({ query: text, site }));
    if (seen.has(norm)) continue;
    seen.add(norm);
    const repeat = sent.has(norm);
    const intent = PLAN_INTENTS.includes(raw.intent as PlanQuery["intent"])
      ? (raw.intent as PlanQuery["intent"])
      : "pain";
    out.push({
      id: raw.id?.trim() || `q${i + 1}`,
      query: text,
      ...(site ? { site } : {}),
      intent,
      checked: mode === "draft" ? !repeat : raw.checked !== false,
      ...(repeat ? { repeat: true } : {}),
    });
    if (out.length >= DEPTH_LIMITS[depth].maxQueries) break;
  }
  return out;
}

// ---------- Screening search results ----------

/** Sites whose pages are video, images or behind a login wall: never worth a scrape. */
const NEVER_READ = [
  "youtube.com",
  "youtu.be",
  "tiktok.com",
  "instagram.com",
  "facebook.com",
  "pinterest.com",
  "linkedin.com",
  "vimeo.com",
];

/** Words people use when something hurts or is missing (global: use with `match`, not `test`). */
export const PAIN_WORDS =
  /\b(?:frustrat\w*|annoy\w*|hate|sucks?|painful|struggl\w*|wish|alternative\w*|switch(?:ed|ing)|problem|issue|slow|expensive|overpriced|broken|bug|tedious|waste|manual(?:ly)?|workaround|complain\w*|can't|cannot|doesn't|won't|missing|need(?:ed)? a)\b/gi;
const ASKING =
  /\b(?:how do (?:you|i)|is there (?:a|any)|any (?:tool|app|way)|recommend\w*|looking for|what do you use|anyone (?:else|know|use))\b/i;
const LISTICLE = /\b(?:top|best)\s+\d+\b|\b\d+\s+best\b/i;

export type ScreenedResult = SearchHit & { urlKey: string; site: string; score: number };

/**
 * Code score for one result from its title and snippet alone: pain words, a
 * question someone asked, and a discussion or review page all count for it.
 * Listicles score low (they rank tools, they don't complain). Higher is more
 * worth reading.
 */
export function scoreResult(hit: SearchHit): number {
  const text = `${hit.title} ${hit.description}`;
  let score = Math.min(4, (text.match(PAIN_WORDS) ?? []).length);
  if (ASKING.test(text) || hit.title.trim().endsWith("?")) score += 2;
  const kind = inferSourceKind(hit.url);
  if (kind === "thread") score += 3;
  else if (kind === "review") score += 2;
  if (LISTICLE.test(hit.title)) score -= 3;
  return score;
}

/**
 * Screen every search result of a run before triage: unreadable files,
 * sites that are never worth reading, excluded sites, duplicates (by
 * `url_key`, first one wins) and pages the topic already has all go; the
 * rest are scored and the best `maxCandidates` kept, best first. Ties keep
 * search order, so the result is the same each time for the same input.
 */
export function screenResults(
  hits: SearchHit[],
  options: { excludeSites?: string[]; topicKeys: ReadonlySet<string>; maxCandidates: number },
): { candidates: ScreenedResult[]; distinct: number } {
  const exclude = [
    ...NEVER_READ,
    ...(options.excludeSites ?? []).map(normalizeSite).filter((s): s is string => !!s),
  ];
  const seen = new Set<string>();
  const kept: Array<ScreenedResult & { order: number }> = [];
  for (const hit of hits) {
    const key = urlKey(hit.url);
    const site = siteOf(hit.url);
    if (!key || !site || seen.has(key)) continue;
    seen.add(key);
    if (!isReadableUrl(hit.url) || onSite(site, exclude) || options.topicKeys.has(key)) continue;
    kept.push({ ...hit, urlKey: key, site, score: scoreResult(hit), order: kept.length });
  }
  const candidates = kept
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, options.maxCandidates)
    .map(({ order: _order, ...rest }) => rest);
  return { candidates, distinct: seen.size };
}
