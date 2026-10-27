/**
 * Firecrawl client: the `/v2/scrape` `question` format (ask one page a
 * plain-English question, used by Extracts), plus `/v2/search` and Markdown
 * page reads used by the trip agent's research tools, page metadata for link previews,
 * and metered search and page reads for Research runs (which report what each call cost).
 *
 * Kept free of DB / framework imports so the request builder and response
 * parser can be unit-tested (scripts/firecrawl.test.mjs).
 */

import { PageReadError, parseRetryAfter } from "./page-read-error.ts";

export const FIRECRAWL_SCRAPE_URL = "https://api.firecrawl.dev/v2/scrape";
/** Reuse a Firecrawl-cached copy of the page up to this old (2 days). */
export const DEFAULT_MAX_AGE_MS = 172_800_000;
/** Firecrawl scrapes can take a while (JS rendering + LLM answer). */
const TIMEOUT_MS = 90_000;
/** Answers are short by design; cap what we store. */
export const MAX_ANSWER_CHARS = 100_000;

/** A Firecrawl failure; a `PageReadError`, so research handles it like any page source's. */
export class FirecrawlError extends PageReadError {
  constructor(message: string, status?: number, retryAfterMs?: number) {
    super(message, status, retryAfterMs);
    this.name = "FirecrawlError";
  }
}

export { parseRetryAfter };

export type QuestionRequest = {
  url: string;
  question: string;
  /** `0` forces a live fetch; omitted uses DEFAULT_MAX_AGE_MS. */
  maxAge?: number;
};

export function buildQuestionBody({ url, question, maxAge }: QuestionRequest) {
  return {
    url,
    onlyMainContent: true,
    maxAge: maxAge ?? DEFAULT_MAX_AGE_MS,
    parsers: ["pdf"],
    formats: [{ type: "question", question }],
  };
}

/**
 * Pull the answer out of a scrape response. The SDKs expose it as
 * `doc.question`; accept a `{ answer }` object or a top-level `answer` too so
 * a small API shape change doesn't silently drop results.
 */
export function parseQuestionResponse(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    throw new FirecrawlError("Firecrawl returned an unreadable response.");
  }
  const body = payload as { success?: boolean; error?: unknown; data?: unknown };
  if (body.success === false) {
    throw new FirecrawlError(
      typeof body.error === "string" && body.error
        ? body.error
        : "Firecrawl could not scrape that page.",
    );
  }
  const data = (body.data ?? {}) as Record<string, unknown>;
  const candidates = [data.question, data.answer];
  for (const c of candidates) {
    const text =
      typeof c === "string"
        ? c
        : c && typeof c === "object" && typeof (c as { answer?: unknown }).answer === "string"
          ? (c as { answer: string }).answer
          : null;
    if (text && text.trim()) return text.trim().slice(0, MAX_ANSWER_CHARS);
  }
  throw new FirecrawlError("Firecrawl found no answer on that page. Try rephrasing the question.");
}

export function firecrawlApiKey(): string | null {
  return process.env.FIRECRAWL_API_KEY?.trim() || null;
}

/**
 * POST a JSON body to Firecrawl and return the parsed payload. Upstream
 * errors become `FirecrawlError`s with user-safe messages.
 */
async function firecrawlPost(url: string, body: unknown, timeoutMs = TIMEOUT_MS): Promise<unknown> {
  const key = firecrawlApiKey();
  if (!key) throw new FirecrawlError("Firecrawl is not configured on this server.", 503);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    throw new FirecrawlError(
      timedOut ? "Firecrawl took too long to answer. Try again." : "Could not reach Firecrawl.",
      504,
    );
  }

  const payload: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    // Never echo upstream auth errors (they'd reveal key state to users).
    if (res.status === 401) {
      throw new FirecrawlError("Firecrawl rejected the server's API key.", 502);
    }
    // 403 is Firecrawl refusing the site (e.g. reddit.com), not the key.
    if (res.status === 403) {
      throw new FirecrawlError("Firecrawl can't read pages on this site.", 422);
    }
    if (res.status === 402) throw new FirecrawlError("Firecrawl credits are used up.", 502);
    if (res.status === 429) {
      throw new FirecrawlError(
        "Firecrawl is rate limiting — try again shortly.",
        429,
        parseRetryAfter(res.headers.get("retry-after")),
      );
    }
    const upstream =
      payload &&
      typeof payload === "object" &&
      typeof (payload as { error?: unknown }).error === "string"
        ? (payload as { error: string }).error
        : `Firecrawl request failed (${res.status}).`;
    throw new FirecrawlError(upstream.slice(0, 300), 502);
  }
  return payload;
}

/** Ask Firecrawl a question about one page; resolves to the Markdown answer. */
export async function askPage(req: QuestionRequest): Promise<string> {
  return parseQuestionResponse(await firecrawlPost(FIRECRAWL_SCRAPE_URL, buildQuestionBody(req)));
}

// ---------- Web search + page reading (trip agent research) ----------

export const FIRECRAWL_SEARCH_URL = "https://api.firecrawl.dev/v2/search";
/** Research calls run inside a chat turn, so they get a shorter leash. */
const RESEARCH_TIMEOUT_MS = 45_000;
export const MAX_SEARCH_RESULTS = 8;
/** Page text handed to a model is capped so one page can't flood its context. */
export const MAX_PAGE_CHARS = 12_000;

export type SearchResult = { title: string; url: string; description: string };

export function buildSearchBody(query: string, limit = 5) {
  return {
    query,
    limit: Math.min(MAX_SEARCH_RESULTS, Math.max(1, Math.floor(limit))),
    sources: ["web"],
  };
}

/**
 * Read search results; accepts the v2 `{ data: { web: [] } }` and a flat
 * `{ data: [] }` shape. Keeps at most `max` (the trip agent's cap unless a
 * caller asks for more).
 */
export function parseSearchResponse(payload: unknown, max = MAX_SEARCH_RESULTS): SearchResult[] {
  if (!payload || typeof payload !== "object") {
    throw new FirecrawlError("Firecrawl returned an unreadable response.");
  }
  const body = payload as { success?: boolean; error?: unknown; data?: unknown };
  if (body.success === false) {
    throw new FirecrawlError(
      typeof body.error === "string" && body.error ? body.error : "Firecrawl search failed.",
    );
  }
  const data = body.data;
  const list = Array.isArray(data)
    ? data
    : data && typeof data === "object" && Array.isArray((data as { web?: unknown }).web)
      ? (data as { web: unknown[] }).web
      : [];
  const results: SearchResult[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.url !== "string" || !/^https?:\/\//i.test(e.url)) continue;
    results.push({
      url: e.url,
      title: typeof e.title === "string" ? e.title.slice(0, 300) : e.url,
      description: typeof e.description === "string" ? e.description.slice(0, 600) : "",
    });
  }
  return results.slice(0, max);
}

export function buildReadBody(url: string) {
  return {
    url,
    onlyMainContent: true,
    maxAge: DEFAULT_MAX_AGE_MS,
    parsers: ["pdf"],
    formats: ["markdown"],
  };
}

/** Pull the page Markdown out of a scrape response, capped at MAX_PAGE_CHARS. */
export function parseReadResponse(payload: unknown): { markdown: string; truncated: boolean } {
  if (!payload || typeof payload !== "object") {
    throw new FirecrawlError("Firecrawl returned an unreadable response.");
  }
  const body = payload as { success?: boolean; error?: unknown; data?: unknown };
  if (body.success === false) {
    throw new FirecrawlError(
      typeof body.error === "string" && body.error
        ? body.error
        : "Firecrawl could not read that page.",
    );
  }
  const markdown = (body.data as { markdown?: unknown } | undefined)?.markdown;
  if (typeof markdown !== "string" || !markdown.trim()) {
    throw new FirecrawlError("That page had no readable text.");
  }
  const text = markdown.trim();
  return { markdown: text.slice(0, MAX_PAGE_CHARS), truncated: text.length > MAX_PAGE_CHARS };
}

/** Search the web through Firecrawl. */
export async function searchWeb(query: string, limit?: number): Promise<SearchResult[]> {
  return parseSearchResponse(
    await firecrawlPost(FIRECRAWL_SEARCH_URL, buildSearchBody(query, limit), RESEARCH_TIMEOUT_MS),
  );
}

/** Read one page as Markdown (Firecrawl's cached copy when under 2 days old). */
export async function readPage(url: string): Promise<{ markdown: string; truncated: boolean }> {
  return parseReadResponse(
    await firecrawlPost(FIRECRAWL_SCRAPE_URL, buildReadBody(url), RESEARCH_TIMEOUT_MS),
  );
}

export type PageMetadata = {
  title?: string;
  imageUrl?: string;
  description?: string;
  siteName?: string;
};

/** Pull title / image / description out of a scrape response's `metadata`. */
export function parseMetadataResponse(payload: unknown): PageMetadata {
  const data = (payload as { data?: { metadata?: Record<string, unknown> } } | null)?.data;
  const m = data?.metadata ?? {};
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  return {
    title: str(m["og:title"]) ?? str(m.ogTitle) ?? str(m.title),
    imageUrl: str(m["og:image"]) ?? str(m.ogImage),
    description: str(m["og:description"]) ?? str(m.ogDescription) ?? str(m.description),
    siteName: str(m["og:site_name"]) ?? str(m.ogSiteName),
  };
}

/** Read a page's title / image / description through Firecrawl (JS-rendered, bot-friendly). */
export async function readPageMetadata(url: string): Promise<PageMetadata> {
  return parseMetadataResponse(
    await firecrawlPost(
      FIRECRAWL_SCRAPE_URL,
      { url, onlyMainContent: true, maxAge: DEFAULT_MAX_AGE_MS, formats: ["markdown"] },
      30_000,
    ),
  );
}

// ---------- Research search + page reads (metered) ----------

/** Research asks for more results per query than the trip agent; Firecrawl bills per 10. */
export const RESEARCH_MAX_SEARCH_RESULTS = 20;
/** Research reads run in the background, so they get the full scrape timeout. */
const RESEARCH_SCRAPE_TIMEOUT_MS = 60_000;

/** What Firecrawl bills for a search returning `results` results: 2 credits per 10, rounded up. */
export function searchCreditCost(results: number): number {
  return results > 0 ? 2 * Math.ceil(results / 10) : 0;
}

/** What Firecrawl bills for one scrape without paid extras (no PDF parsing, no stealth proxy). */
export const SCRAPE_CREDIT_COST = 1;

/**
 * Firecrawl's own count of credits a call used, when the response carries
 * one (`creditsUsed` at the top level, or in `data.metadata` for scrapes).
 */
export function parseCreditsUsed(payload: unknown): number | null {
  const body = payload as {
    creditsUsed?: unknown;
    data?: { metadata?: { creditsUsed?: unknown } };
  } | null;
  const value = body?.creditsUsed ?? body?.data?.metadata?.creditsUsed;
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

/** `tbs` for "results from the last `months` months" (Google's custom date range). */
export function sinceMonthsTbs(months: number, now: Date): string {
  const from = new Date(now);
  from.setUTCMonth(from.getUTCMonth() - Math.max(1, Math.floor(months)));
  const day = `${from.getUTCMonth() + 1}/${from.getUTCDate()}/${from.getUTCFullYear()}`;
  return `cdr:1,cd_min:${day}`;
}

export function buildResearchSearchBody(
  query: string,
  limit: number,
  options: { sinceMonths?: number; now?: Date } = {},
) {
  return {
    query,
    limit: Math.min(RESEARCH_MAX_SEARCH_RESULTS, Math.max(1, Math.floor(limit))),
    sources: ["web"],
    ...(options.sinceMonths
      ? { tbs: sinceMonthsTbs(options.sinceMonths, options.now ?? new Date()) }
      : {}),
  };
}

export type ResearchSearch = { results: SearchResult[]; credits: number };

/** Search the web for a research run, with what it cost. */
export async function researchSearch(
  query: string,
  limit: number,
  options: { sinceMonths?: number } = {},
): Promise<ResearchSearch> {
  const body = buildResearchSearchBody(query, limit, options);
  const payload = await firecrawlPost(FIRECRAWL_SEARCH_URL, body, RESEARCH_TIMEOUT_MS);
  const results = parseSearchResponse(payload, RESEARCH_MAX_SEARCH_RESULTS);
  return { results, credits: parseCreditsUsed(payload) ?? searchCreditCost(results.length) };
}

/**
 * A main-content Markdown scrape. No PDF parser: Firecrawl bills PDFs per
 * page, and research skips PDFs before scraping anyway.
 */
export function buildResearchScrapeBody(url: string) {
  return {
    url,
    onlyMainContent: true,
    maxAge: DEFAULT_MAX_AGE_MS,
    parsers: [],
    formats: ["markdown"],
  };
}

export type ResearchPage = {
  markdown: string;
  title: string;
  publishedAt: Date | null;
  credits: number;
};

/** A date from page metadata, when it is one. */
function metadataDate(m: Record<string, unknown>): Date | null {
  for (const key of ["publishedTime", "article:published_time", "datePublished", "date"]) {
    const v = m[key];
    if (typeof v !== "string") continue;
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

/** Pull the page Markdown, title, date and cost out of a research scrape response. */
export function parseResearchScrapeResponse(payload: unknown): ResearchPage {
  if (!payload || typeof payload !== "object") {
    throw new FirecrawlError("Firecrawl returned an unreadable response.");
  }
  const body = payload as { success?: boolean; error?: unknown; data?: unknown };
  if (body.success === false) {
    throw new FirecrawlError(
      typeof body.error === "string" && body.error
        ? body.error
        : "Firecrawl could not read that page.",
    );
  }
  const data = (body.data ?? {}) as { markdown?: unknown; metadata?: Record<string, unknown> };
  if (typeof data.markdown !== "string" || !data.markdown.trim()) {
    throw new FirecrawlError("That page had no readable text.");
  }
  const m = data.metadata ?? {};
  const title = [m.title, m["og:title"], m.ogTitle].find(
    (t): t is string => typeof t === "string" && Boolean(t.trim()),
  );
  return {
    markdown: data.markdown,
    title: title?.trim().slice(0, 300) ?? "",
    publishedAt: metadataDate(m),
    credits: parseCreditsUsed(payload) ?? SCRAPE_CREDIT_COST,
  };
}

/** Read one page for a research run, with what it cost. Untrimmed; the caller trims and caps. */
export async function researchScrape(url: string): Promise<ResearchPage> {
  return parseResearchScrapeResponse(
    await firecrawlPost(
      FIRECRAWL_SCRAPE_URL,
      buildResearchScrapeBody(url),
      RESEARCH_SCRAPE_TIMEOUT_MS,
    ),
  );
}
