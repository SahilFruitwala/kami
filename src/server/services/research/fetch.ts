import "@tanstack/react-start/server-only";
import { createHash } from "node:crypto";
import { getDb } from "@/lib/db.server";
import {
  FirecrawlError,
  SCRAPE_CREDIT_COST,
  researchScrape,
  researchSearch,
  searchCreditCost,
  type ResearchPage,
  type SearchResult,
} from "@/lib/firecrawl.server.ts";
import {
  linkTopicSource,
  sourcesByUrlKey,
  upsertSource,
  type SourceRow,
} from "@/lib/research-db.server.ts";
import type { SourceOrigin } from "@/lib/research/kinds.ts";
import {
  inferSourceKind,
  isReadableUrl,
  isSourceFresh,
  siteOf,
  trimPageMarkdown,
  urlKey,
} from "@/lib/research/sources.ts";
import type { StepContext } from "./runs";

/**
 * Research's web access: metered Firecrawl searches and page reads, and the
 * per-user source cache in front of them. Every paid call is checked against
 * the run's budget first and counted right after; a fresh cached page costs
 * nothing and makes no Firecrawl call.
 */

/** The part of a step's context that meters spend. */
export type Meter = Pick<StepContext, "ensureBudget" | "recordSpend">;

/** Swappable Firecrawl calls (tests pass fakes). */
export type FirecrawlCalls = {
  search: typeof researchSearch;
  scrape: (url: string) => Promise<ResearchPage>;
  now: () => number;
};

const live: FirecrawlCalls = { search: researchSearch, scrape: researchScrape, now: Date.now };

/**
 * One metered search. The budget check uses the most it can cost
 * (`limit` results); the run is charged what Firecrawl reports.
 */
export async function searchForRun(
  meter: Meter,
  query: string,
  limit: number,
  options: { sinceMonths?: number } = {},
  calls: Partial<FirecrawlCalls> = {},
): Promise<SearchResult[]> {
  const { search } = { ...live, ...calls };
  meter.ensureBudget({ firecrawlCredits: searchCreditCost(limit) });
  const { results, credits } = await search(query, limit, options);
  await meter.recordSpend({ firecrawlCredits: credits });
  return results;
}

export type SourceRequest = {
  userId: string;
  topicId: string;
  runId: string | null;
  url: string;
  addedBy: SourceOrigin;
  maxPageChars: number;
};

export type FetchedSource = { source: SourceRow; cached: boolean };

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

/**
 * A page as a stored source, linked to the topic: the cached copy while it
 * is fresh for its kind, otherwise a metered scrape, trimmed, capped and
 * stored in place of any older copy. Throws `FirecrawlError` for pages that
 * can't be read; callers skip those and carry on.
 */
export async function getOrFetchSource(
  meter: Meter,
  request: SourceRequest,
  calls: Partial<FirecrawlCalls> = {},
): Promise<FetchedSource> {
  const { scrape, now } = { ...live, ...calls };
  const key = urlKey(request.url);
  if (!key || !isReadableUrl(request.url)) {
    throw new FirecrawlError("Research only reads web pages.");
  }
  const db = await getDb();
  const cached = (await sourcesByUrlKey(db, request.userId, [key])).get(key);
  if (cached && isSourceFresh(cached.fetchedAt, cached.kind, now())) {
    await linkTopicSource(db, request.topicId, cached.id, request.runId);
    return { source: cached, cached: true };
  }

  meter.ensureBudget({ firecrawlCredits: SCRAPE_CREDIT_COST });
  const page = await scrape(request.url);
  await meter.recordSpend({ firecrawlCredits: page.credits });

  const markdown = trimPageMarkdown(page.markdown).slice(0, request.maxPageChars).trim();
  if (!markdown) throw new FirecrawlError("That page had no readable text.");
  const source = await upsertSource(db, request.userId, {
    url: request.url,
    urlKey: key,
    site: siteOf(request.url) as string,
    kind: inferSourceKind(request.url),
    title: page.title || cached?.title || "",
    markdown,
    contentHash: sha256(markdown),
    publishedAt: page.publishedAt,
    addedBy: request.addedBy,
  });
  await linkTopicSource(db, request.topicId, source.id, request.runId);
  return { source, cached: false };
}
