import type { SearchHit } from "./kinds.ts";
import { siteOf } from "./sources.ts";

/**
 * Players (spec §5.3), pure: the products and companies already in a space.
 * A name found in evidence becomes a Player once, however it is written
 * (`nameKey`); a Player's homepage is picked from search results by code
 * (`pickHomepage`); and every price the model reports must appear in the
 * fetched pricing page (`checkPricing`) or it is dropped. Tested in
 * tests/research-players.test.mjs.
 */

export const PLAYER_AUDIENCES = ["b2b", "b2c", "both"] as const;
export type PlayerAudience = (typeof PLAYER_AUDIENCES)[number];

export type PlayerPlan = { name: string; price: string };
export type PlayerPricing = { plans: PlayerPlan[] };

/** Players one run fills in (each costs about 4 Firecrawl credits) _(start values)_. */
export const FILL_LIMITS = { quick: 8, deep: 20 } as const;

const TRAILING_WORDS = /\b(?:inc|llc|ltd|gmbh|corp|corporation|company|co|app|apps|software)\b\.?$/;
const TLD = /\.(?:com|io|ai|app|co|net|org|dev|so|me|xyz)$/;

/**
 * The key two spellings of one product share: lowercase, no accents, no
 * company suffix or domain ending, letters and digits only ("Notion.so",
 * "notion", "Notion Inc." → "notion"). Null when too little is left.
 */
export function nameKey(raw: string): string | null {
  let s = raw.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  s = s.replace(TLD, "").trim();
  for (let i = 0; i < 2; i++)
    s = s
      .replace(/[\s,]+$/, "")
      .replace(TRAILING_WORDS, "")
      .trim();
  s = s.replace(/[^a-z0-9]+/g, "");
  return s.length >= 2 && s.length <= 60 ? s : null;
}

/** Hosts that are never a product's own site. */
const NOT_A_HOMEPAGE =
  /(?:^|\.)(?:wikipedia\.org|reddit\.com|youtube\.com|g2\.com|capterra\.com|trustpilot\.com|producthunt\.com|linkedin\.com|facebook\.com|twitter\.com|x\.com|medium\.com|github\.com|crunchbase\.com|alternativeto\.net|news\.ycombinator\.com)$/;

/**
 * The product's own site from search results: the first result whose host
 * contains the product's name key. Returns the site's origin, or null when no
 * result looks like the product's site (the Player is then left unfilled
 * rather than filled from a guess).
 */
export function pickHomepage(name: string, hits: readonly Pick<SearchHit, "url">[]): string | null {
  const key = nameKey(name);
  if (!key) return null;
  for (const hit of hits) {
    const site = siteOf(hit.url);
    if (!site || NOT_A_HOMEPAGE.test(site)) continue;
    if (site.replace(/[^a-z0-9]/g, "").includes(key)) {
      try {
        return new URL(hit.url).origin;
      } catch {
        continue;
      }
    }
  }
  return null;
}

/** The pricing page to try for a site: the one most sites use. */
export function pricingUrl(origin: string): string {
  return `${origin.replace(/\/+$/, "")}/pricing`;
}

const PRICE_TOKEN = /\d[\d,.]*/g;

/**
 * Keep only the plans whose price is on the pricing page: every number in the
 * price ("$12", "from 9.99") must appear in the page text. A free plan
 * ("Free", "$0") is kept when the page says "free". At most 6 plans.
 */
export function checkPricing(
  plans: ReadonlyArray<{ name?: string | null; price?: string | null }>,
  pageText: string,
): PlayerPlan[] {
  const page = pageText.toLowerCase();
  const out: PlayerPlan[] = [];
  for (const plan of plans) {
    const name = (plan.name ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
    const price = (plan.price ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
    if (!name || !price) continue;
    const numbers = price.match(PRICE_TOKEN) ?? [];
    const found = numbers.length
      ? numbers.every((n) => page.includes(n.replace(/[.,]$/, "")))
      : /free/i.test(price) && page.includes("free");
    if (!found) continue;
    out.push({ name, price });
    if (out.length >= 6) break;
  }
  return out;
}

export type PlayerSortKey = "name" | "mentions" | "complaints" | "free";

type Sortable = {
  name: string;
  mentions: number;
  complaints: number;
  freePlan: boolean | null;
};

/** Sort comparator for the Players table; ties fall back to name. */
export function comparePlayers(key: PlayerSortKey, a: Sortable, b: Sortable): number {
  const by =
    key === "name"
      ? a.name.localeCompare(b.name)
      : key === "mentions"
        ? b.mentions - a.mentions
        : key === "complaints"
          ? b.complaints - a.complaints
          : Number(b.freePlan === true) - Number(a.freePlan === true);
  return by || a.name.localeCompare(b.name);
}

/** Players grouped by category (largest group first, "Uncategorised" last), each group sorted. */
export function groupPlayers<T extends Sortable & { category: string | null }>(
  players: readonly T[],
  sort: PlayerSortKey,
): Array<{ category: string; players: T[] }> {
  const groups = new Map<string, T[]>();
  for (const p of players) {
    const category = p.category?.trim() || "Uncategorised";
    groups.set(category, [...(groups.get(category) ?? []), p]);
  }
  return [...groups.entries()]
    .map(([category, list]) => ({
      category,
      players: [...list].sort((a, b) => comparePlayers(sort, a, b)),
    }))
    .sort(
      (a, b) =>
        Number(a.category === "Uncategorised") - Number(b.category === "Uncategorised") ||
        b.players.length - a.players.length ||
        a.category.localeCompare(b.category),
    );
}
