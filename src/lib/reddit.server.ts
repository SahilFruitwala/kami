import { PageReadError, parseRetryAfter } from "./page-read-error.ts";

/**
 * Reading a Reddit thread through its public `.json` (Firecrawl refuses
 * reddit.com). Free and keyless, but Reddit limits unauthenticated reads to
 * about 10 a minute and asks for a descriptive User-Agent, so callers space
 * reads at least REDDIT_MIN_GAP_MS apart. Read-only, one thread at a time, at
 * a personal tool's scale.
 *
 * The thread becomes plain Markdown: the post, then one block per comment
 * (author, date, score, then the comment as written), best comments first.
 * Request building and parsing are pure; tested in tests/reddit.test.mjs.
 */

export const REDDIT_USER_AGENT =
  "web:kami-research:1.0 (personal research tool; https://github.com/SahilFruitwala/kami)";
/** About 9 reads a minute, under Reddit's ~10 for unauthenticated clients. */
export const REDDIT_MIN_GAP_MS = 6_500;
const TIMEOUT_MS = 20_000;
/** Comments kept per thread; the page cap trims further. */
const MAX_COMMENTS = 250;

const REDDIT_HOST = /^(?:www\.|old\.|new\.|np\.|m\.)?reddit\.com$/i;

/** The `.json` address for a Reddit thread URL; null for anything that isn't a thread. */
export function redditThreadJsonUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (!REDDIT_HOST.test(url.hostname)) return null;
  const m = url.pathname.match(/^\/r\/([^/]+)\/comments\/([a-z0-9]+)/i);
  if (!m) return null;
  return `https://www.reddit.com/r/${m[1]}/comments/${m[2]}.json?raw_json=1&sort=top&limit=${MAX_COMMENTS}&depth=6`;
}

export type DiscussionPage = { title: string; markdown: string; publishedAt: Date | null };

type Listing = { data?: { children?: Array<{ kind?: string; data?: Record<string, unknown> }> } };

const str = (v: unknown) => (typeof v === "string" ? v : "");
const day = (seconds: unknown) =>
  typeof seconds === "number" && Number.isFinite(seconds)
    ? new Date(seconds * 1000).toISOString().slice(0, 10)
    : "";
const isGone = (text: string) => !text.trim() || text === "[deleted]" || text === "[removed]";

/** Turn a thread's `.json` into a discussion page; throws PageReadError when it isn't one. */
export function parseRedditThread(payload: unknown): DiscussionPage {
  if (!Array.isArray(payload) || payload.length < 2) {
    throw new PageReadError("Reddit didn't return a thread.");
  }
  const post = (payload[0] as Listing).data?.children?.[0]?.data;
  if (!post) throw new PageReadError("Reddit didn't return a thread.");

  const title = str(post.title).trim();
  const blocks: string[] = [`# ${title}`];
  const meta = [`u/${str(post.author) || "deleted"}`, day(post.created_utc)].filter(Boolean);
  const selftext = str(post.selftext);
  blocks.push(meta.join(" · ") + (isGone(selftext) ? "" : `\n\n${selftext.trim()}`));

  let kept = 0;
  const walk = (listing: Listing | undefined, depth: number) => {
    for (const child of listing?.data?.children ?? []) {
      if (kept >= MAX_COMMENTS) return;
      if (child.kind !== "t1" || !child.data) continue;
      const c = child.data;
      const body = str(c.body);
      if (!isGone(body)) {
        const who = `**u/${str(c.author) || "deleted"}**`;
        const when = day(c.created_utc);
        const score = typeof c.score === "number" ? `${c.score} points` : "";
        const reply = depth > 0 ? "reply" : "";
        blocks.push(`${[who, when, score, reply].filter(Boolean).join(" · ")}\n\n${body.trim()}`);
        kept++;
      }
      if (c.replies && typeof c.replies === "object") walk(c.replies as Listing, depth + 1);
    }
  };
  walk(payload[1] as Listing, 0);

  const created = typeof post.created_utc === "number" ? new Date(post.created_utc * 1000) : null;
  return { title, markdown: blocks.join("\n\n---\n\n"), publishedAt: created };
}

/** Read one Reddit thread. Callers pace calls (REDDIT_MIN_GAP_MS) and retry 429s. */
export async function readRedditThread(url: string): Promise<DiscussionPage> {
  const jsonUrl = redditThreadJsonUrl(url);
  if (!jsonUrl) throw new PageReadError("That isn't a Reddit thread.");
  let res: Response;
  try {
    res = await fetch(jsonUrl, {
      headers: { "user-agent": REDDIT_USER_AGENT, accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new PageReadError("Couldn't reach Reddit.");
  }
  if (res.status === 429) {
    throw new PageReadError(
      "Reddit is rate limiting — try again shortly.",
      429,
      parseRetryAfter(res.headers.get("retry-after")),
    );
  }
  if (!res.ok) throw new PageReadError(`Reddit wouldn't share that thread (${res.status}).`, 422);
  return parseRedditThread(await res.json().catch(() => null));
}
