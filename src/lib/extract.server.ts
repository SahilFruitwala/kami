import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import type { Article, ExtractResult } from "./article-types.ts";
import { absoluteUrl, assertPublicHttpUrl } from "./safe-url.ts";
import { xmlEscape } from "./xml.ts";

import { fetchText } from "./fetch-text.server.ts";
import { buildArticle, countWords, excerptOf, textFromHtml } from "./article-build.server.ts";
import { sanitizeHtml } from "./sanitize-html.server.ts";
import { extractTweet, formatTweetDate } from "./extract-tweet.server.ts";
import { markdownToHtml } from "./markdown.ts";
import { extractSubstack, isSubstackDocument } from "./extract-substack.server.ts";

type UrlKind =
  | { kind: "x-status"; id: string; url: URL }
  | { kind: "x-article"; id: string; url: URL }
  | { kind: "web"; url: URL };

function classify(url: URL): UrlKind {
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  const isX =
    host === "x.com" ||
    host === "twitter.com" ||
    host === "mobile.twitter.com" ||
    host === "fxtwitter.com" ||
    host === "vxtwitter.com";
  if (isX) {
    const status = url.pathname.match(/\/status\/(\d+)/);
    if (status?.[1]) return { kind: "x-status", id: status[1], url };
    const article =
      url.pathname.match(/\/(?:i\/)?(?:[^/]+\/)?article\/(\d+)/) ||
      url.pathname.match(/\/article\/(\d+)/);
    if (article?.[1]) return { kind: "x-article", id: article[1], url };
  }
  return { kind: "web", url };
}

function metaContent(document: Document, selectors: string[]): string {
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    const content =
      el?.getAttribute("content") || el?.getAttribute("href") || el?.textContent || "";
    if (content.trim()) return content.trim();
  }
  return "";
}

function extractJsonLd(document: Document): {
  title?: string;
  author?: string;
  date?: string;
  image?: string;
} {
  const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
  for (const script of scripts) {
    try {
      const raw = JSON.parse(script.textContent || "");
      const nodes = Array.isArray(raw) ? raw : raw["@graph"] ? raw["@graph"] : [raw];
      for (const node of nodes) {
        if (!node || typeof node !== "object") continue;
        const type = String(node["@type"] ?? "");
        if (!/Article|BlogPosting|NewsArticle|WebPage/i.test(type) && !node.headline) continue;
        const author = node.author;
        const authorName =
          typeof author === "string"
            ? author
            : Array.isArray(author)
              ? author
                  .map((a) => a?.name)
                  .filter(Boolean)
                  .join(", ")
              : author?.name;
        const image = typeof node.image === "string" ? node.image : node.image?.url;
        return {
          title: node.headline || node.name,
          author: authorName,
          date: node.datePublished || node.dateCreated,
          image,
        };
      }
    } catch {
      // ignore bad json-ld
    }
  }
  return {};
}

function readabilityFromHtml(
  html: string,
  pageUrl: string,
  source: Article["source"],
): Article | null {
  return readabilityResult(html, pageUrl, source).article;
}

/**
 * The article from a page, plus whether a real extractor found it
 * (`readable`) rather than the fallback that dumps the page's opening text.
 */
function readabilityResult(
  html: string,
  pageUrl: string,
  source: Article["source"],
): { article: Article | null; readable: boolean } {
  const { document } = parseHTML(html);
  const base = document.createElement("base");
  base.setAttribute("href", pageUrl);
  document.head?.appendChild(base);

  const ld = extractJsonLd(document as unknown as Document);
  const ogTitle = metaContent(document as unknown as Document, [
    'meta[property="og:title"]',
    'meta[name="twitter:title"]',
    "title",
  ]);
  const ogSite = metaContent(document as unknown as Document, ['meta[property="og:site_name"]']);
  const ogAuthor = metaContent(document as unknown as Document, [
    'meta[name="author"]',
    'meta[property="article:author"]',
  ]);
  const ogDate = metaContent(document as unknown as Document, [
    'meta[property="article:published_time"]',
    'meta[name="date"]',
    "time[datetime]",
  ]);
  const ogImage = metaContent(document as unknown as Document, [
    'meta[property="og:image"]',
    'meta[name="twitter:image"]',
  ]);

  const published = formatTweetDate(ld.date || ogDate);
  const hero = ld.image || ogImage || null;
  const heroImage = hero ? absoluteUrl(hero, pageUrl) : null;

  const doc = document as unknown as Document;
  if (isSubstackDocument(doc, pageUrl)) {
    const substack = extractSubstack(doc, pageUrl);
    const article = substack
      ? buildArticle({
          url: pageUrl,
          canonicalUrl: pageUrl,
          title: substack.title || ld.title || ogTitle,
          author: ld.author || substack.author || ogAuthor,
          siteName: ogSite,
          published,
          contentHtml: substack.contentHtml,
          source,
          heroImage,
          excerpt: substack.subtitle,
        })
      : null;
    // Too short (e.g. a hard paywall) — let Readability have a go below.
    if (article) return { article, readable: true };
  }

  let parsed: {
    title?: string | null;
    byline?: string | null;
    content?: string | null;
    excerpt?: string | null;
  } | null = null;
  try {
    parsed = new Readability(document as never, {
      charThreshold: 80,
    }).parse();
  } catch {
    parsed = null;
  }

  const contentHtml = parsed?.content || "";
  const title = (parsed?.title || ld.title || ogTitle || "").trim();
  const author = (parsed?.byline || ld.author || ogAuthor || "").trim();
  const article = buildArticle({
    url: pageUrl,
    canonicalUrl: pageUrl,
    title,
    author,
    siteName: ogSite,
    published,
    contentHtml:
      contentHtml || (title ? `<p>${xmlEscape(textFromHtml(html).slice(0, 4000))}</p>` : ""),
    source,
    heroImage,
  });
  return { article, readable: Boolean(contentHtml) && article !== null };
}

async function extractViaJina(url: string): Promise<Article | null> {
  try {
    const { text } = await fetchText(`https://r.jina.ai/${url}`, "text/plain", {
      "X-Timeout": "15",
    });
    if (!text.trim()) return null;
    const titleMatch = text.match(/^Title:\s*(.+)$/m);
    const title = titleMatch?.[1]?.trim() || "";
    const mdIndex = text.search(/Markdown Content:\s*/i);
    const markdown = mdIndex >= 0 ? text.slice(mdIndex).replace(/Markdown Content:\s*/i, "") : text;
    const html = markdownToHtml(markdown);
    return buildArticle({
      url,
      canonicalUrl: url,
      title,
      author: "",
      siteName: new URL(url).hostname.replace(/^www\./, ""),
      published: null,
      contentHtml: html,
      source: "blog",
      heroImage: null,
    });
  } catch {
    return null;
  }
}

function looksLikeChallengePage(html: string): boolean {
  const sample = html.slice(0, 12_000).toLowerCase();
  const signals = [
    "cf-browser-verification",
    "cf-challenge",
    "challenge-platform",
    "attention required",
    "just a moment...",
    "enable javascript and cookies",
    "checking your browser",
    "verify you are human",
    "access denied",
    "bot detection",
    "captcha",
  ];
  if (signals.some((s) => sample.includes(s))) return true;
  const plain = textFromHtml(html);
  return plain.length < 80 && /cloudflare|akamai|perimeter|datadome|recaptcha/i.test(sample);
}

export function articleFromLinkOnly(rawUrl: string, title?: string): Article {
  const pageUrl = assertPublicHttpUrl(rawUrl);
  const href = pageUrl.href;
  const host = pageUrl.hostname.replace(/^www\./, "");
  const safeTitle = (title || "").trim() || host;
  const contentHtml = sanitizeHtml(
    `<p><em>Saved as a link.</em> Automatic capture was blocked — open the original, or paste the article / capture it with the KAMI bookmarklet or extension.</p><p><a href="${href.replace(/"/g, "&quot;")}">Open original</a></p>`,
    href,
  );
  return {
    url: href,
    canonicalUrl: href,
    title: safeTitle,
    author: "",
    siteName: host,
    published: null,
    excerpt: "Saved as a link. Paste the article or use the bookmarklet for a full offline copy.",
    contentHtml,
    wordCount: countWords(textFromHtml(contentHtml)),
    readingMinutes: 1,
    source: "blog",
    heroImage: null,
  };
}

export function articleFromManualImport(input: {
  url?: string;
  title: string;
  contentHtml?: string;
  contentText?: string;
}): Article {
  // Each URL-less paste gets its own placeholder: ids and the per-user
  // URL uniqueness derive from it, so a shared one made every new paste
  // overwrite the previous pasted article.
  let href = `https://imported.local/article/${crypto.randomUUID()}`;
  let host = "imported";
  if (input.url?.trim()) {
    const pageUrl = assertPublicHttpUrl(input.url.trim());
    href = pageUrl.href;
    host = pageUrl.hostname.replace(/^www\./, "");
  }
  const rawHtml =
    input.contentHtml?.trim() ||
    (input.contentText || "")
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => `<p>${p.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`)
      .join("") ||
    "";
  const contentHtml = sanitizeHtml(rawHtml, href);
  const plain = textFromHtml(contentHtml);
  const words = countWords(plain);
  if (!plain || words < 8) {
    throw new Error("Not enough readable text to import. Paste more of the article.");
  }
  return {
    url: href,
    canonicalUrl: href,
    title: input.title.trim() || excerptOf(plain, 90),
    author: "",
    siteName: host,
    published: null,
    excerpt: excerptOf(plain),
    contentHtml,
    wordCount: words,
    readingMinutes: Math.max(1, Math.round(words / 200)),
    source: "blog",
    heroImage: null,
  };
}

/**
 * A page captured in the user's browser (bookmarklet / extension): run it
 * through the same extraction as a server fetch — site rules, Readability,
 * metadata — and only fall back to sanitizing the raw HTML if that fails.
 */
export function articleFromCapturedPage(input: {
  url?: string;
  title: string;
  html: string;
}): Article {
  let href = "";
  if (input.url?.trim()) href = assertPublicHttpUrl(input.url.trim()).href;
  if (href) {
    const source: Article["source"] = classify(new URL(href)).kind === "web" ? "blog" : "x";
    const article = readabilityFromHtml(input.html, href, source);
    if (article) {
      return { ...article, title: article.title || input.title.trim() };
    }
  }
  return articleFromManualImport({
    url: href || undefined,
    title: input.title,
    contentHtml: input.html,
  });
}

/**
 * Last-resort extractor for a fetched page that Readability couldn't parse
 * (the AI block picker, when configured). Returns null to fall through.
 */
export type ExtractFallback = (page: {
  html: string;
  url: string;
  source: Article["source"];
}) => Promise<Article | null>;

export async function extractArticleFromUrl(
  rawUrl: string,
  fallback?: ExtractFallback,
): Promise<ExtractResult> {
  let pageUrl: URL;
  try {
    pageUrl = assertPublicHttpUrl(rawUrl);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Invalid URL." };
  }

  const classified = classify(pageUrl);

  if (classified.kind === "x-status" || classified.kind === "x-article") {
    const tweet = await extractTweet(classified.id, classified.url.href);
    if (tweet) return { ok: true, article: tweet };
  }

  let fetched: { text: string; finalUrl: string; contentType: string } | null = null;
  try {
    fetched = await fetchText(pageUrl.href, "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8");
  } catch (err) {
    const viaJina = await extractViaJina(pageUrl.href);
    if (viaJina) return { ok: true, article: viaJina };
    return {
      ok: false,
      error:
        err instanceof Error
          ? `Could not reach that page. ${err.message}`
          : "Could not reach that page.",
    };
  }

  const source: Article["source"] = classified.kind === "web" ? "blog" : "x";
  const challenge = looksLikeChallengePage(fetched.text);

  const finalUrl = fetched.finalUrl || pageUrl.href;
  const tryFallback = async () => {
    if (!fallback || challenge || classified.kind !== "web") return null;
    try {
      return await fallback({ html: fetched.text, url: finalUrl, source });
    } catch (err) {
      console.warn("[extract] fallback failed:", err instanceof Error ? err.message : err);
      return null;
    }
  };

  if (!challenge) {
    const fromDom = readabilityResult(fetched.text, finalUrl, source);
    if (fromDom.article && fromDom.readable) return { ok: true, article: fromDom.article };
    // Readability found nothing: prefer the fallback over a dump of the page's text.
    const picked = await tryFallback();
    if (picked) return { ok: true, article: picked };
    if (fromDom.article) return { ok: true, article: fromDom.article };
  }

  const viaJina = await extractViaJina(finalUrl);
  if (viaJina) return { ok: true, article: viaJina };

  return {
    ok: false,
    error: challenge
      ? "That site blocked automatic capture (bot check). Use Paste article or the bookmarklet, or save the link for later."
      : classified.kind === "web"
        ? "Not enough readable text on that page. Try Paste article, the bookmarklet, or save the link."
        : "That post could not be read. It may be private, deleted, or behind a login.",
  };
}
