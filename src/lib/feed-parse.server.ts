import { DOMParser } from "linkedom";
import { decodeBasicEntities } from "./xml.ts";

/**
 * Feed parsing — RSS 2.0, RSS 1.0 (RDF), Atom and JSON Feed — into one
 * small shape. Pure (no I/O) so it is unit-tested directly.
 *
 * Bodies are returned raw; they are sanitized only if a reader saves the
 * entry into their library (`buildArticle`), never rendered from here.
 */

export type ParsedEntry = {
  guid: string;
  url: string;
  title: string;
  author: string;
  /** Full body when the feed carries one (content:encoded / atom content). */
  contentHtml: string;
  /** Plain-text teaser for the inbox list. */
  excerpt: string;
  imageUrl: string | null;
  /** ms since epoch, or null when the feed gives no parseable date. */
  publishedAt: number | null;
};

export type ParsedFeed = {
  title: string;
  siteUrl: string | null;
  /** Publisher's polling hint (RSS <ttl>, minutes), if any. */
  ttlMinutes: number | null;
  entries: ParsedEntry[];
};

/** Newest entries kept from one fetch of a feed document. */
export const MAX_ENTRIES_PER_FETCH = 50;
/** Stored feed-supplied body cap (raw HTML). */
export const MAX_ENTRY_HTML = 400_000;

const EXCERPT_MAX = 280;

export function plainText(html: string): string {
  return decodeBasicEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/&#(\d+);/g, (_m, n: string) => safeCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n: string) => safeCodePoint(parseInt(n, 16)))
    .replace(/\s+/g, " ")
    .trim();
}

function safeCodePoint(n: number): string {
  try {
    return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : " ";
  } catch {
    return " ";
  }
}

export function excerptFrom(text: string, max = EXCERPT_MAX): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  const cut = slice.lastIndexOf(" ");
  return `${(cut > max / 3 ? slice.slice(0, cut) : slice).trim()}…`;
}

/** Absolute http(s) URL or null. */
export function httpUrl(raw: string | null | undefined, base?: string | null): string | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    const url = base ? new URL(value, base) : new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.href;
  } catch {
    return null;
  }
}

function parseDate(raw: string | null | undefined): number | null {
  const value = raw?.trim();
  if (!value) return null;
  const ms = Date.parse(value);
  if (Number.isFinite(ms)) return ms;
  // RFC 822 dates with named zones Date.parse rejects ("EDT" works, "CEST" not).
  const stripped = Date.parse(value.replace(/\s+[A-Z]{3,5}$/, " GMT"));
  return Number.isFinite(stripped) ? stripped : null;
}

// ---------- XML helpers (namespace-prefix agnostic) ----------

type El = Element;

const local = (el: El) => (el.tagName || "").toLowerCase().replace(/^.*:/, "");
const qname = (el: El) => (el.tagName || "").toLowerCase();

/**
 * Direct children named `name` (`prefix:name` matches exactly). An unprefixed
 * name prefers unprefixed tags — an RSS channel's `<link>` must win over its
 * `<atom:link rel="self">` — and only falls back to any prefix if none exist.
 */
function kids(el: El, name: string): El[] {
  const children = Array.from(el.children ?? []);
  const exact = children.filter((child) => qname(child) === name);
  if (exact.length || name.includes(":")) return exact;
  return children.filter((child) => local(child) === name);
}

function kid(el: El, ...names: string[]): El | null {
  for (const name of names) {
    const found = kids(el, name)[0];
    if (found) return found;
  }
  return null;
}

function text(el: El | null): string {
  return (el?.textContent ?? "").trim();
}

function cleanTitle(raw: string): string {
  return plainText(raw).slice(0, 500);
}

function firstImageIn(html: string, base: string | null): string | null {
  const match = /<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/i.exec(html);
  if (!match) return null;
  const url = httpUrl(decodeBasicEntities(match[1]), base);
  // Skip tracking pixels / spacers.
  if (!url || /1x1|pixel|spacer|\/beacon|open\.gif/i.test(url)) return null;
  return url;
}

function mediaImage(item: El, base: string | null): string | null {
  for (const name of ["media:thumbnail", "media:content"]) {
    for (const el of kids(item, name)) {
      const type = el.getAttribute("type") ?? "";
      const medium = el.getAttribute("medium") ?? "";
      if (name === "media:content" && type && !type.startsWith("image/") && medium !== "image")
        continue;
      const url = httpUrl(el.getAttribute("url"), base);
      if (url) return url;
    }
  }
  const group = kid(item, "media:group");
  if (group) {
    const nested = mediaImage(group, base);
    if (nested) return nested;
  }
  for (const el of kids(item, "enclosure")) {
    if ((el.getAttribute("type") ?? "").startsWith("image/")) {
      const url = httpUrl(el.getAttribute("url"), base);
      if (url) return url;
    }
  }
  const itunes = kid(item, "itunes:image");
  return httpUrl(itunes?.getAttribute("href"), base);
}

function finishEntry(e: {
  guid: string;
  url: string | null;
  title: string;
  author: string;
  contentHtml: string;
  summaryHtml: string;
  imageUrl: string | null;
  publishedAt: number | null;
  base: string | null;
}): ParsedEntry | null {
  const contentHtml = e.contentHtml.length > MAX_ENTRY_HTML ? "" : e.contentHtml;
  const body = contentHtml || e.summaryHtml;
  const teaser = plainText(e.summaryHtml || contentHtml);
  const title = cleanTitle(e.title) || excerptFrom(teaser, 90);
  const url = e.url ?? "";
  const guid = (e.guid || url || `${title}|${e.publishedAt ?? ""}`).slice(0, 1000);
  if (!guid || (!title && !url)) return null;
  return {
    guid,
    url,
    title: title || "Untitled",
    author: plainText(e.author).slice(0, 300),
    contentHtml: body.length > MAX_ENTRY_HTML ? "" : body,
    excerpt: excerptFrom(teaser),
    imageUrl: e.imageUrl ?? firstImageIn(body, e.base),
    publishedAt: e.publishedAt,
  };
}

function parseRssItem(item: El, base: string | null): ParsedEntry | null {
  const link = httpUrl(text(kid(item, "link")), base);
  const guidEl = kid(item, "guid");
  const guid = text(guidEl);
  const guidIsLink = guidEl?.getAttribute("isPermaLink") !== "false";
  return finishEntry({
    guid,
    url: link ?? (guidIsLink ? httpUrl(guid, base) : null),
    title: text(kid(item, "title")),
    author: text(kid(item, "dc:creator", "author", "itunes:author")),
    contentHtml: text(kid(item, "content:encoded")),
    summaryHtml: text(kid(item, "description", "itunes:summary")),
    imageUrl: mediaImage(item, base),
    publishedAt: parseDate(text(kid(item, "pubdate", "dc:date", "published", "updated"))),
    base,
  });
}

function atomLink(el: El, base: string | null): string | null {
  const links = kids(el, "link");
  const alternate =
    links.find((l) => (l.getAttribute("rel") ?? "alternate") === "alternate") ?? links[0];
  return httpUrl(alternate?.getAttribute("href"), base);
}

/** Atom text construct: type="html" is escaped markup (already decoded by the parser). */
function atomHtml(el: El | null): string {
  if (!el) return "";
  const type = el.getAttribute("type") ?? "text";
  if (type === "xhtml") return el.innerHTML ?? text(el);
  if (type === "html") return text(el);
  return text(el).replace(/&/g, "&amp;").replace(/</g, "&lt;");
}

function parseAtomEntry(entry: El, base: string | null): ParsedEntry | null {
  const authorEl = kid(entry, "author");
  return finishEntry({
    guid: text(kid(entry, "id")),
    url: atomLink(entry, base),
    title: text(kid(entry, "title")),
    author: authorEl ? text(kid(authorEl, "name")) || text(authorEl) : "",
    contentHtml: atomHtml(kid(entry, "content")),
    summaryHtml: atomHtml(kid(entry, "summary")),
    imageUrl: mediaImage(entry, base),
    publishedAt: parseDate(text(kid(entry, "published", "updated", "issued", "modified"))),
    base,
  });
}

function parseTtl(channel: El): number | null {
  const ttl = Number(text(kid(channel, "ttl")));
  return Number.isFinite(ttl) && ttl > 0 ? Math.round(ttl) : null;
}

function parseXmlFeed(xml: string, feedUrl: string): ParsedFeed | null {
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(xml, "text/xml") as unknown as Document;
  } catch {
    return null;
  }
  const root = doc.documentElement as El | null;
  if (!root) return null;
  const kind = local(root);

  if (kind === "rss" || kind === "rdf") {
    const channel = kid(root, "channel");
    if (!channel) return null;
    const siteUrl = httpUrl(text(kid(channel, "link")), feedUrl);
    const base = siteUrl ?? feedUrl;
    // RSS 2.0 nests <item> in <channel>; RSS 1.0 (RDF) puts them beside it.
    const items = kind === "rss" ? kids(channel, "item") : kids(root, "item");
    return {
      title: cleanTitle(text(kid(channel, "title"))),
      siteUrl,
      ttlMinutes: parseTtl(channel),
      entries: items
        .slice(0, MAX_ENTRIES_PER_FETCH)
        .map((item) => parseRssItem(item, base))
        .filter((e): e is ParsedEntry => Boolean(e)),
    };
  }

  if (kind === "feed") {
    const siteUrl = atomLink(root, feedUrl);
    const base = siteUrl ?? feedUrl;
    return {
      title: cleanTitle(text(kid(root, "title"))),
      siteUrl,
      ttlMinutes: null,
      entries: kids(root, "entry")
        .slice(0, MAX_ENTRIES_PER_FETCH)
        .map((entry) => parseAtomEntry(entry, base))
        .filter((e): e is ParsedEntry => Boolean(e)),
    };
  }

  return null;
}

type JsonFeedItem = {
  id?: unknown;
  url?: unknown;
  external_url?: unknown;
  title?: unknown;
  content_html?: unknown;
  content_text?: unknown;
  summary?: unknown;
  image?: unknown;
  banner_image?: unknown;
  date_published?: unknown;
  date_modified?: unknown;
  author?: { name?: unknown };
  authors?: Array<{ name?: unknown }>;
};

const str = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

function parseJsonFeed(raw: string, feedUrl: string): ParsedFeed | null {
  let data: { version?: unknown; title?: unknown; home_page_url?: unknown; items?: unknown };
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object" || !str(data.version).includes("jsonfeed.org")) {
    return null;
  }
  const siteUrl = httpUrl(str(data.home_page_url), feedUrl);
  const base = siteUrl ?? feedUrl;
  const items = Array.isArray(data.items) ? (data.items as JsonFeedItem[]) : [];
  return {
    title: cleanTitle(str(data.title)),
    siteUrl,
    ttlMinutes: null,
    entries: items
      .slice(0, MAX_ENTRIES_PER_FETCH)
      .map((item) => {
        const textBody = str(item.content_text);
        const html =
          str(item.content_html) ||
          (textBody
            ? textBody
                .split(/\n{2,}/)
                .map((p) => `<p>${p.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</p>`)
                .join("")
            : "");
        return finishEntry({
          guid: str(item.id),
          url: httpUrl(str(item.url) || str(item.external_url), base),
          title: str(item.title),
          author: str(item.authors?.[0]?.name) || str(item.author?.name),
          contentHtml: html,
          summaryHtml: str(item.summary),
          imageUrl: httpUrl(str(item.image) || str(item.banner_image), base),
          publishedAt: parseDate(str(item.date_published) || str(item.date_modified)),
          base,
        });
      })
      .filter((e): e is ParsedEntry => Boolean(e)),
  };
}

/** Parse a fetched feed document; null when it is not a feed. */
export function parseFeed(body: string, feedUrl: string): ParsedFeed | null {
  const trimmed = body.replace(/^\uFEFF/, "").trimStart();
  if (trimmed.startsWith("{")) return parseJsonFeed(trimmed, feedUrl);
  if (!trimmed.startsWith("<")) return null;
  // Cheap sniff before a DOM parse: HTML pages are discovery input, not feeds.
  const head = trimmed.slice(0, 2000).toLowerCase();
  if (!/<(rss|feed|rdf:rdf)[\s>]/.test(head)) return null;
  return parseXmlFeed(trimmed, feedUrl);
}

const FEED_TYPES =
  /application\/(rss|atom|rdf|feed)\+xml|application\/(feed\+)?json|text\/xml|application\/xml/i;

/** `<link rel="alternate" type="application/rss+xml" href>` URLs in a page, best first. */
export function discoverFeedLinks(html: string, pageUrl: string): string[] {
  const head = html.slice(0, 300_000);
  const found: Array<{ url: string; score: number }> = [];
  for (const match of head.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0];
    const attr = (name: string) =>
      new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
    const value = (name: string) => {
      const m = attr(name);
      return m ? decodeBasicEntities(m[1] ?? m[2] ?? m[3] ?? "") : "";
    };
    if (!/\balternate\b/i.test(value("rel"))) continue;
    const type = value("type");
    if (!FEED_TYPES.test(type)) continue;
    const url = httpUrl(value("href"), pageUrl);
    if (!url) continue;
    // Prefer the main feed over per-post comment feeds.
    const comments = /comment/i.test(url) || /comment/i.test(value("title"));
    const score = (comments ? 10 : 0) + (/atom/i.test(type) ? 1 : 0);
    if (!found.some((f) => f.url === url)) found.push({ url, score });
  }
  return found.sort((a, b) => a.score - b.score).map((f) => f.url);
}

/** Conventional feed paths to probe when a page advertises none. */
export function guessFeedUrls(pageUrl: string): string[] {
  let origin: string;
  let path: string;
  try {
    const u = new URL(pageUrl);
    origin = u.origin;
    path = u.pathname.replace(/\/+$/, "");
  } catch {
    return [];
  }
  const out = new Set<string>();
  if (path) out.add(`${origin}${path}/feed`);
  for (const p of ["/feed", "/rss.xml", "/feed.xml", "/atom.xml", "/index.xml", "/rss/"]) {
    out.add(`${origin}${p}`);
  }
  return [...out];
}
