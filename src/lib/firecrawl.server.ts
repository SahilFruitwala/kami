/**
 * Firecrawl client: the `/v2/scrape` `question` format (ask one page a
 * plain-English question, used by Extracts), plus page metadata for link previews.
 *
 * Kept free of DB / framework imports so the request builder and response
 * parser can be unit-tested (scripts/firecrawl.test.mjs).
 */

export const FIRECRAWL_SCRAPE_URL = "https://api.firecrawl.dev/v2/scrape";
/** Reuse a Firecrawl-cached copy of the page up to this old (2 days). */
export const DEFAULT_MAX_AGE_MS = 172_800_000;
/** Firecrawl scrapes can take a while (JS rendering + LLM answer). */
const TIMEOUT_MS = 90_000;
/** Answers are short by design; cap what we store. */
export const MAX_ANSWER_CHARS = 100_000;

export class FirecrawlError extends Error {
  // Plain field (no constructor parameter property) so Node's type stripping
  // can load this file in tests.
  readonly status: number | undefined;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "FirecrawlError";
    this.status = status;
  }
}

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
    if (res.status === 401 || res.status === 403) {
      throw new FirecrawlError("Firecrawl rejected the server's API key.", 502);
    }
    if (res.status === 402) throw new FirecrawlError("Firecrawl credits are used up.", 502);
    if (res.status === 429)
      throw new FirecrawlError("Firecrawl is rate limiting — try again shortly.", 429);
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
