import "@tanstack/react-start/server-only";
import { createHash } from "node:crypto";
import { getDb } from "@/lib/db.server";
import {
  SCRAPE_CREDIT_COST,
  researchScrape,
  researchSearch,
  searchCreditCost,
  type ResearchPage,
} from "@/lib/firecrawl.server.ts";
import {
  HN_SITE,
  hnItemJsonUrl,
  readHackerNewsItem,
  searchHackerNews,
} from "@/lib/hackernews.server.ts";
import { PageReadError } from "@/lib/page-read-error.ts";
import {
  REDDIT_MIN_GAP_MS,
  readRedditThread,
  redditThreadJsonUrl,
  type DiscussionPage,
} from "@/lib/reddit.server.ts";
import {
  linkTopicSource,
  sourcesByUrlKey,
  upsertSource,
  type SourceRow,
} from "@/lib/research-db.server.ts";
import { rateLimitWait } from "@/lib/research/backoff.ts";
import { searchText } from "@/lib/research/discover.ts";
import type { PlanQuery, SearchHit, SourceOrigin } from "@/lib/research/kinds.ts";
import {
  inferSourceKind,
  isReadableUrl,
  isSourceFresh,
  siteOf,
  trimPageMarkdown,
  urlKey,
} from "@/lib/research/sources.ts";
import type { Meter } from "./runs";

/**
 * Research's web access and the per-user source cache in front of it.
 *
 * - Searches: Hacker News queries go to its free Algolia search; everything
 *   else is a metered Firecrawl search.
 * - Pages: Reddit threads are read through Reddit's public `.json` (Firecrawl
 *   refuses reddit.com), paced to stay under Reddit's limit; Hacker News
 *   discussions through Algolia; everything else is a metered Firecrawl scrape.
 *
 * Every paid call is checked against the run's budget first and counted right
 * after; free sources and a fresh cached page cost nothing. Every source is
 * retried while it rate limits.
 */

/** Swappable outside calls and clock (tests pass fakes). */
export type FirecrawlCalls = {
  search: typeof researchSearch;
  scrape: (url: string) => Promise<ResearchPage>;
  hnSearch: typeof searchHackerNews;
  hnItem: (url: string) => Promise<DiscussionPage>;
  redditThread: (url: string) => Promise<DiscussionPage>;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
};

const live: FirecrawlCalls = {
  search: researchSearch,
  scrape: researchScrape,
  hnSearch: searchHackerNews,
  hnItem: readHackerNewsItem,
  redditThread: readRedditThread,
  now: Date.now,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/**
 * Run a call, waiting and retrying while its source rate limits it (429),
 * then giving up with its error. A refused call isn't billed, so retries
 * cost nothing.
 */
async function withRateLimitRetry<T>(
  call: () => Promise<T>,
  sleep: (ms: number) => Promise<void>,
): Promise<T> {
  for (let retry = 0; ; retry++) {
    try {
      return await call();
    } catch (err) {
      const wait =
        err instanceof PageReadError && err.status === 429
          ? rateLimitWait(retry, err.retryAfterMs)
          : null;
      if (wait === null) throw err;
      console.warn(`[research] ${(err as Error).message} Retrying in ${Math.round(wait / 1000)}s.`);
      await sleep(wait);
    }
  }
}

/** When this process may next read from Reddit (reads are spaced REDDIT_MIN_GAP_MS apart). */
let redditNextAt = 0;

/** Test hook: forget the pacing state. */
export function resetRedditPacing() {
  redditNextAt = 0;
}

/**
 * One search for a plan query, with what it found. Hacker News queries are
 * free; others are budget-checked against the most they can cost (`limit`
 * results) and charged what Firecrawl reports.
 */
export async function searchForRun(
  meter: Meter,
  query: Pick<PlanQuery, "query" | "site">,
  limit: number,
  options: { sinceMonths?: number } = {},
  calls: Partial<FirecrawlCalls> = {},
): Promise<SearchHit[]> {
  const { search, hnSearch, sleep } = { ...live, ...calls };
  if (query.site === HN_SITE) {
    return withRateLimitRetry(() => hnSearch(query.query, limit, options), sleep);
  }
  meter.ensureBudget({ firecrawlCredits: searchCreditCost(limit) });
  const text = searchText(query);
  const { results, credits } = await withRateLimitRetry(() => search(text, limit, options), sleep);
  await meter.recordSpend({ firecrawlCredits: credits });
  return results.map(({ url, title, description }) => ({ url, title, description }));
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

type Read = { markdown: string; title: string; publishedAt: Date | null };

/** Read a page from the source that serves it: free readers for discussions, else Firecrawl. */
async function readPage(meter: Meter, url: string, calls: FirecrawlCalls): Promise<Read> {
  const { scrape, hnItem, redditThread, now, sleep } = calls;
  if (redditThreadJsonUrl(url)) {
    const wait = redditNextAt - now();
    if (wait > 0) await sleep(wait);
    redditNextAt = now() + REDDIT_MIN_GAP_MS;
    return withRateLimitRetry(() => redditThread(url), sleep);
  }
  if (hnItemJsonUrl(url)) return withRateLimitRetry(() => hnItem(url), sleep);

  meter.ensureBudget({ firecrawlCredits: SCRAPE_CREDIT_COST });
  const page = await withRateLimitRetry(() => scrape(url), sleep);
  await meter.recordSpend({ firecrawlCredits: page.credits });
  // Discussion readers build clean Markdown; scraped pages need their furniture trimmed.
  return { ...page, markdown: trimPageMarkdown(page.markdown) };
}

/**
 * A page as a stored source, linked to the topic: the cached copy while it
 * is fresh for its kind, otherwise a fresh read, capped and stored in place
 * of any older copy. Throws `PageReadError` for pages that can't be read;
 * callers skip those and carry on.
 */
export async function getOrFetchSource(
  meter: Meter,
  request: SourceRequest,
  calls: Partial<FirecrawlCalls> = {},
): Promise<FetchedSource> {
  const all = { ...live, ...calls };
  const key = urlKey(request.url);
  if (!key || !isReadableUrl(request.url)) {
    throw new PageReadError("Research only reads web pages.");
  }
  const db = await getDb();
  const cached = (await sourcesByUrlKey(db, request.userId, [key])).get(key);
  if (cached && isSourceFresh(cached.fetchedAt, cached.kind, all.now())) {
    await linkTopicSource(db, request.topicId, cached.id, request.runId);
    return { source: cached, cached: true };
  }

  const page = await readPage(meter, request.url, all);
  const markdown = page.markdown.slice(0, request.maxPageChars).trim();
  if (!markdown) throw new PageReadError("That page had no readable text.");
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
