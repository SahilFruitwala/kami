import type { SearchHit } from "./research/kinds.ts";
import { PageReadError, parseRetryAfter } from "./page-read-error.ts";
import type { DiscussionPage } from "./reddit.server.ts";

/**
 * Hacker News through the free Algolia API (hn.algolia.com): searching
 * stories and comments, and reading a whole discussion. No key, no credits.
 * A search hit points at its story's discussion
 * (news.ycombinator.com/item?id=…), with the matching comment as the
 * snippet, so triage sees what people actually said.
 *
 * Request building and parsing are pure; tested in tests/hackernews.test.mjs.
 */

export const HN_SEARCH_URL = "https://hn.algolia.com/api/v1/search";
export const HN_ITEM_URL = "https://hn.algolia.com/api/v1/items";
export const HN_SITE = "news.ycombinator.com";
const TIMEOUT_MS = 20_000;
/** Comments kept per discussion; the page cap trims further. */
const MAX_COMMENTS = 300;

/** HN text is HTML: paragraphs, links, italics, code and entities. */
export function hnHtmlToText(html: string): string {
  return html
    .replace(/<p>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<a\s[^>]*>(.*?)<\/a>/gis, "$1")
    .replace(/<\/?(?:i|em|b|strong|code|pre)>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#x2F;/gi, "/")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function hnDiscussionUrl(id: string | number): string {
  return `https://${HN_SITE}/item?id=${id}`;
}

export function buildHnSearchUrl(
  query: string,
  limit: number,
  options: { sinceMonths?: number; now?: Date } = {},
): string {
  const params = new URLSearchParams({
    query,
    tags: "(story,comment)",
    hitsPerPage: String(Math.min(50, Math.max(1, Math.floor(limit)))),
  });
  if (options.sinceMonths) {
    const from = new Date(options.now ?? new Date());
    from.setUTCMonth(from.getUTCMonth() - options.sinceMonths);
    params.set("numericFilters", `created_at_i>${Math.floor(from.getTime() / 1000)}`);
  }
  return `${HN_SEARCH_URL}?${params}`;
}

/** Search hits, one per discussion (the first matching story or comment wins). */
export function parseHnSearch(payload: unknown, limit: number): SearchHit[] {
  const hits = (payload as { hits?: unknown } | null)?.hits;
  if (!Array.isArray(hits))
    throw new PageReadError("Hacker News search returned nothing readable.");
  const seen = new Set<string>();
  const out: SearchHit[] = [];
  for (const raw of hits) {
    const h = raw as Record<string, unknown>;
    const storyId = h.story_id ?? h.objectID;
    if (storyId === undefined || storyId === null) continue;
    const url = hnDiscussionUrl(String(storyId));
    if (seen.has(url)) continue;
    seen.add(url);
    const title = String(h.title ?? h.story_title ?? "").trim();
    const text = hnHtmlToText(String(h.comment_text ?? h.story_text ?? ""));
    out.push({ url, title: title || "Hacker News discussion", description: text.slice(0, 600) });
    if (out.length >= limit) break;
  }
  return out;
}

/** The Algolia item address for a discussion URL; null for anything that isn't one. */
export function hnItemJsonUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.hostname.replace(/^www\./, "") !== HN_SITE || url.pathname !== "/item") return null;
    const id = url.searchParams.get("id");
    return id && /^\d+$/.test(id) ? `${HN_ITEM_URL}/${id}` : null;
  } catch {
    return null;
  }
}

type HnNode = {
  title?: string | null;
  text?: string | null;
  author?: string | null;
  created_at?: string | null;
  points?: number | null;
  children?: HnNode[];
};

/** Turn an Algolia item tree into a discussion page. */
export function parseHnItem(payload: unknown): DiscussionPage {
  const root = payload as HnNode | null;
  if (!root || typeof root !== "object") {
    throw new PageReadError("Hacker News didn't return a discussion.");
  }
  const title = (root.title ?? "").trim() || "Hacker News discussion";
  const blocks: string[] = [`# ${title}`];
  const head = [root.author ? `${root.author}` : "", root.created_at?.slice(0, 10) ?? ""];
  const rootText = root.text ? hnHtmlToText(root.text) : "";
  blocks.push(head.filter(Boolean).join(" · ") + (rootText ? `\n\n${rootText}` : ""));

  let kept = 0;
  const walk = (nodes: HnNode[] | undefined, depth: number) => {
    for (const node of nodes ?? []) {
      if (kept >= MAX_COMMENTS) return;
      const text = node.text ? hnHtmlToText(node.text) : "";
      if (text) {
        const meta = [
          `**${node.author ?? "deleted"}**`,
          node.created_at?.slice(0, 10) ?? "",
          depth > 0 ? "reply" : "",
        ];
        blocks.push(`${meta.filter(Boolean).join(" · ")}\n\n${text}`);
        kept++;
      }
      walk(node.children, depth + 1);
    }
  };
  walk(root.children, 0);

  const published = root.created_at ? new Date(root.created_at) : null;
  return {
    title,
    markdown: blocks.join("\n\n---\n\n"),
    publishedAt: published && !Number.isNaN(published.getTime()) ? published : null,
  };
}

async function getJson(url: string, what: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new PageReadError(`Couldn't reach Hacker News ${what}.`);
  }
  if (res.status === 429) {
    throw new PageReadError(
      "Hacker News search is rate limiting — try again shortly.",
      429,
      parseRetryAfter(res.headers.get("retry-after")),
    );
  }
  if (!res.ok) throw new PageReadError(`Hacker News ${what} failed (${res.status}).`, 422);
  return res.json().catch(() => null);
}

/** Search Hacker News stories and comments (free). */
export async function searchHackerNews(
  query: string,
  limit: number,
  options: { sinceMonths?: number } = {},
): Promise<SearchHit[]> {
  return parseHnSearch(await getJson(buildHnSearchUrl(query, limit, options), "search"), limit);
}

/** Read a whole Hacker News discussion (free). */
export async function readHackerNewsItem(url: string): Promise<DiscussionPage> {
  const itemUrl = hnItemJsonUrl(url);
  if (!itemUrl) throw new PageReadError("That isn't a Hacker News discussion.");
  return parseHnItem(await getJson(itemUrl, "discussion"));
}
