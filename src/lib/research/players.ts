import type { Depth, PlanQuery, SearchHit } from "./kinds.ts";
import { DEPTH_LIMITS } from "./discover.ts";
import { inferSourceKind, siteOf } from "./sources.ts";
import type { ReportClaim, ReportSection } from "./report.ts";

/**
 * Players: products named in evidence, deduped by a normalised name_key.
 * Homepages are picked from search hits in code; pricing is the home origin
 * plus /pricing. Tested in tests/research-players.test.mjs.
 */

/** Sites that list or discuss products — never a Player's own homepage. */
const NOT_HOME =
  /(?:^|\.)(?:reddit\.com|news\.ycombinator\.com|ycombinator\.com|g2\.com|capterra\.com|trustpilot\.com|producthunt\.com|indiehackers\.com|alternativeto\.net|g2crowd\.com|youtube\.com|medium\.com|substack\.com|x\.com|twitter\.com|facebook\.com|linkedin\.com|quora\.com|apps\.apple\.com|play\.google\.com)$/;

export type PlayerPricing = { plans: Array<{ name: string; price: string }> };

export const EMPTY_PRICING: PlayerPricing = { plans: [] };

/** Lowercased, punctuation-folded, legal suffixes dropped — the unique key in a topic. */
export function nameKey(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "")
    .replace(/\b(?:incorporated|corporation|company|inc|llc|ltd|corp|gmbh|co)\b\.?/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function looksLikeProductHome(url: string): boolean {
  const site = siteOf(url);
  if (!site || NOT_HOME.test(site)) return false;
  const kind = inferSourceKind(url);
  return kind === "homepage" || kind === "pricing" || kind === "other";
}

/** Best official-looking page for a name among search hits, or null. */
export function pickHomepage(hits: readonly SearchHit[], name: string): string | null {
  const tokens = nameKey(name)
    .split(" ")
    .filter((t) => t.length > 1);
  if (!tokens.length) return null;
  const ranked = hits
    .filter((h) => looksLikeProductHome(h.url))
    .map((h) => {
      const hay = `${h.title} ${h.url}`.toLowerCase();
      const score = tokens.filter((t) => hay.includes(t)).length;
      const kind = inferSourceKind(h.url);
      const homeBoost = kind === "homepage" ? 2 : kind === "pricing" ? 1 : 0;
      return { url: h.url, score: score + homeBoost, hits: score };
    })
    .filter((h) => h.hits > 0)
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.url ?? null;
}

/** The pricing page for a homepage: same origin, `/pricing`. */
export function pricingPageUrl(home: string): string | null {
  try {
    const url = new URL(home);
    if (!/^https?:$/.test(url.protocol)) return null;
    if (/\/(?:pricing|plans|price)(?:\/|$)/i.test(url.pathname)) return home;
    url.pathname = "/pricing";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

export const EXPLORE_NEEDLES = [
  {
    needle: "best",
    intent: "alternatives" as const,
    query: (seed: string) => `best ${seed} tools`,
  },
  {
    needle: "alternatives",
    intent: "alternatives" as const,
    query: (seed: string) => `${seed} alternatives`,
  },
  {
    needle: "directory",
    intent: "alternatives" as const,
    query: (seed: string) => `${seed} software directory`,
  },
] as const;

export function requiredExploreQueries(seed: string): Array<Pick<PlanQuery, "query" | "intent">> {
  const space = seed.replace(/\s+/g, " ").trim() || "this space";
  return EXPLORE_NEEDLES.map((n) => ({ query: n.query(space), intent: n.intent }));
}

function hasNeedle(query: string, needle: string): boolean {
  return query.toLowerCase().includes(needle);
}

/** Mark covering queries and append any missing Explore searches, inside the depth cap. */
export function mergeExploreQueries(plan: PlanQuery[], seed: string, depth: Depth): PlanQuery[] {
  const missing = EXPLORE_NEEDLES.filter(
    (n) => !plan.some((q) => hasNeedle(q.query, n.needle)),
  ).map((n, i) => ({
    id: `e${i + 1}`,
    query: n.query(seed.replace(/\s+/g, " ").trim() || "this space"),
    intent: n.intent,
    checked: true,
  }));
  return [...plan, ...missing].slice(0, DEPTH_LIMITS[depth].maxQueries);
}

/**
 * When Validate's Existing solutions section is empty, list the topic's
 * Players. Claims cite the evidence already linked to each Player.
 */
export function fillSolutionsFromPlayers(
  sections: ReportSection[],
  players: Array<{ name: string; oneLiner: string; evidenceIds: string[] }>,
): ReportSection[] {
  if (!players.length) return sections;
  return sections.map((section) => {
    if (section.id !== "solutions" || section.claims.length) return section;
    const claims: ReportClaim[] = players.map((p) => {
      const text = p.oneLiner ? `${p.name}: ${p.oneLiner}` : p.name;
      const evidenceIds = [...new Set(p.evidenceIds.filter(Boolean))];
      return {
        text,
        evidenceIds,
        ...(evidenceIds.length ? {} : { unsupported: true }),
      };
    });
    return { ...section, claims };
  });
}
