import type { SourceKind } from "./kinds.ts";

/**
 * Pure helpers for Research sources: the cache key for a URL, what kind of
 * page it is (which decides how long a stored copy stays fresh), and
 * trimming and chunking page Markdown so models are sent less. Tested in
 * tests/research-sources.test.mjs.
 */

/** Query parameters that only track where a click came from. */
const TRACKING_PARAMS = new Set([
  "ref",
  "ref_src",
  "ref_url",
  "source",
  "fbclid",
  "gclid",
  "dclid",
  "msclkid",
  "igshid",
  "mc_cid",
  "mc_eid",
  "share_id",
  "context",
]);

/** Reddit serves the same thread from all of these hosts. */
const REDDIT_HOSTS = /^(?:www\.|old\.|new\.|np\.|m\.|i\.)?reddit\.com$/;

/** The page's host without `www.`, e.g. `reddit.com`; null for a URL that isn't http(s). */
export function siteOf(raw: string): string | null {
  const url = parseHttpUrl(raw);
  if (!url) return null;
  const host = url.hostname.toLowerCase();
  return REDDIT_HOSTS.test(host) ? "reddit.com" : host.replace(/^www\./, "");
}

function parseHttpUrl(raw: string): URL | null {
  try {
    const url = new URL(raw.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

/**
 * The cache key for a page: host (no `www.`, Reddit hosts folded) + path +
 * the query without tracking parameters, sorted. No scheme, no fragment, no
 * trailing slash. Reddit thread slugs are dropped (`/r/x/comments/abc/slug`
 * and `/r/x/comments/abc` are one thread). Null for a URL that isn't http(s).
 */
export function urlKey(raw: string): string | null {
  const url = parseHttpUrl(raw);
  if (!url) return null;
  const host = siteOf(raw) as string;

  let path = url.pathname.replace(/\/{2,}/g, "/");
  if (host === "reddit.com") {
    const thread = path.match(/^(\/r\/[^/]+\/comments\/[^/]+)/i);
    if (thread) path = thread[1];
    // Subreddit names and thread ids aren't case-sensitive; other sites' paths may be.
    path = path.toLowerCase();
  }
  if (path.length > 1) path = path.replace(/\/+$/, "");
  if (path === "/") path = "";

  const params = [...url.searchParams.entries()]
    .filter(
      ([name]) =>
        !name.toLowerCase().startsWith("utm_") && !TRACKING_PARAMS.has(name.toLowerCase()),
    )
    .sort(([a, av], [b, bv]) => (a === b ? av.localeCompare(bv) : a.localeCompare(b)));
  const query = params.length ? `?${new URLSearchParams(params).toString()}` : "";
  return `${host}${path}${query}`;
}

/** Review sites, by host, and the path that marks a review page on each (any path when null). */
const REVIEW_SITES: Array<[RegExp, RegExp | null]> = [
  [/^g2\.com$/, /\/reviews/],
  [/^capterra\.[a-z.]+$/, /\/reviews/],
  [/^(?:[a-z]{2}\.)?trustpilot\.com$/, /^\/review\//],
  [/^getapp\.com$/, /\/reviews/],
  [/^trustradius\.com$/, /\/reviews/],
  [/^apps\.apple\.com$/, null],
  [/^play\.google\.com$/, /^\/store\/apps/],
  [/^producthunt\.com$/, /\/reviews/],
];

/** Discussion pages: forums, Q&A and comment threads. */
const THREAD_SITES: Array<[RegExp, RegExp | null]> = [
  [/^reddit\.com$/, /^\/r\/[^/]+\/comments\//i],
  [/^news\.ycombinator\.com$/, /^\/item/],
  [/^producthunt\.com$/, /^\/(?:posts|products)\//],
  [/^indiehackers\.com$/, /^\/post\//],
  [/^(?:[a-z]+\.)?stackexchange\.com$/, /^\/questions\//],
  [/^stackoverflow\.com$/, /^\/questions\//],
  [/^lobste\.rs$/, /^\/s\//],
  [/^twitter\.com$|^x\.com$/, /\/status\//],
  [/^github\.com$/, /\/(?:issues|discussions)\/\d+/],
];

const ARTICLE_SITES = /(?:^|\.)(?:medium\.com|substack\.com|dev\.to|hashnode\.dev)$/;

function matches(rules: Array<[RegExp, RegExp | null]>, site: string, path: string): boolean {
  return rules.some(([host, p]) => host.test(site) && (p === null || p.test(path)));
}

/** What kind of page a URL is, from its host and path alone. */
export function inferSourceKind(raw: string): SourceKind {
  const url = parseHttpUrl(raw);
  const site = siteOf(raw);
  if (!url || !site) return "other";
  const path = url.pathname.toLowerCase();
  if (matches(REVIEW_SITES, site, path)) return "review";
  if (matches(THREAD_SITES, site, path)) return "thread";
  // Discourse forums: /t/<slug>/<id>
  if (/^\/t\/[^/]+\/\d+/.test(path)) return "thread";
  if (/\/(?:pricing|plans|price)(?:\/|$)/.test(path)) return "pricing";
  if (path === "/" || path === "") return "homepage";
  if (ARTICLE_SITES.test(site) || /\/(?:blog|articles?|news|posts?|guides?)\//.test(path)) {
    return "article";
  }
  return "other";
}

/** How long a stored copy of each kind of page stays fresh, in days _(start values)_. */
export const SOURCE_FRESH_DAYS: Record<SourceKind, number> = {
  thread: 30,
  review: 30,
  pricing: 7,
  homepage: 7,
  article: 90,
  other: 30,
};

const DAY_MS = 86_400_000;

/** Whether a copy fetched at `fetchedAt` can be reused instead of fetching again. */
export function isSourceFresh(fetchedAt: Date | number, kind: SourceKind, now: number): boolean {
  const at = typeof fetchedAt === "number" ? fetchedAt : fetchedAt.getTime();
  return now - at < SOURCE_FRESH_DAYS[kind] * DAY_MS;
}

// ---------- Trimming and chunking ----------

/** A line that is only a link (optionally a list item): navigation, related links, share bars. */
const LINK_ONLY = /^\s*(?:[-*+]|\d+\.)?\s*\[[^\]]*\]\([^)]*\)\s*$/;
const IMAGE_ONLY = /^\s*(?:[-*+]\s*)?!\[[^\]]*\]\([^)]*\)\s*$/;
/** Short lines that are page furniture, not anything someone said. */
const BOILERPLATE =
  /\b(?:cookies?|privacy policy|terms of (?:service|use)|all rights reserved|sign in|log ?in|sign up|subscribe|newsletter|share|reply|report|upvote|downvote|permalink|skip to (?:main )?content|back to top|load more|show more|read more|advertisement|sponsored)\b/i;
const BOILERPLATE_MAX_CHARS = 60;

/**
 * Strip a page's Markdown down to what people wrote: link and image lists,
 * short boilerplate lines (cookie banners, sign-in prompts, share and vote
 * buttons) and runs of blank lines go; inline links keep their text and lose
 * their URL. The result is what gets stored, so quotes are later checked
 * against exactly this text.
 */
export function trimPageMarkdown(markdown: string): string {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const keep: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (IMAGE_ONLY.test(line)) continue;
    if (LINK_ONLY.test(line)) {
      // A lone link can be content ("Here's the thread: …"); a run of them is a menu.
      let run = 1;
      while (run < 3 && i + run < lines.length && LINK_ONLY.test(lines[i + run])) run++;
      const prevIsLink = i > 0 && LINK_ONLY.test(lines[i - 1]);
      if (run >= 3 || prevIsLink) continue;
    }
    const text = line.trim();
    if (text && text.length < BOILERPLATE_MAX_CHARS && BOILERPLATE.test(text)) continue;
    keep.push(line);
  }
  return keep
    .join("\n")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\((?:[^()]|\([^)]*\))*\)/g, "$1")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Split Markdown into chunks of at most `maxChars`, on paragraph boundaries
 * (a comment or a review is usually one or a few paragraphs, so they stay
 * whole). A single paragraph longer than `maxChars` is split at sentence
 * ends, and failing that, hard.
 */
export function chunkMarkdown(markdown: string, maxChars: number): string[] {
  const blocks = markdown
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean)
    .flatMap((b) => (b.length <= maxChars ? [b] : splitLong(b, maxChars)));
  const chunks: string[] = [];
  let current = "";
  for (const block of blocks) {
    if (current && current.length + 2 + block.length > maxChars) {
      chunks.push(current);
      current = "";
    }
    current = current ? `${current}\n\n${block}` : block;
  }
  if (current) chunks.push(current);
  return chunks;
}

function splitLong(block: string, maxChars: number): string[] {
  const sentences = block.match(/[^.!?\n]+(?:[.!?]+|\n|$)\s*/g) ?? [block];
  const out: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (sentence.length > maxChars) {
      if (current) out.push(current.trim());
      current = "";
      for (let i = 0; i < sentence.length; i += maxChars) out.push(sentence.slice(i, i + maxChars));
      continue;
    }
    if (current.length + sentence.length > maxChars) {
      out.push(current.trim());
      current = "";
    }
    current += sentence;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

/** Files research never scrapes: PDFs are billed per page, the rest have no text worth reading. */
const NOT_A_PAGE =
  /\.(?:pdf|zip|gz|tar|dmg|exe|msi|apk|png|jpe?g|gif|webp|svg|mp3|mp4|mov|avi|docx?|xlsx?|pptx?)$/i;

/** Whether a URL is an http(s) web page research may read. */
export function isReadableUrl(raw: string): boolean {
  const url = parseHttpUrl(raw);
  return url !== null && !NOT_A_PAGE.test(url.pathname);
}
