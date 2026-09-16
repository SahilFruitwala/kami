import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import type { Article, ExtractResult } from "./article-types.ts";
import { pickImageSrc, preferReadableImage } from "./image-url.ts";
import { absoluteUrl, assertPublicHttpUrl } from "./safe-url.ts";
import { assertPublicFetchUrl } from "./safe-url.server.ts";
import { decodeBasicEntities, xmlEscape } from "./xml.ts";
import {
  isBareXArticleLink,
  xArticleBlocksToHtml,
  type FxXArticle,
} from "./x-article.ts";

const FETCH_TIMEOUT_MS = 12_000;
const MAX_HTML_BYTES = 2_000_000;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";


async function fetchText(
  url: string,
  accept: string,
  extraHeaders: Record<string, string> = {},
  maxRedirects = 5,
): Promise<{ text: string; finalUrl: string; contentType: string }> {
  // Manual redirect chain so every hop is re-validated against the SSRF
  // denylist **and** DNS resolution — `fetch(..., { redirect: "follow" })`
  // would silently follow a redirect from a public URL to a private/metadata
  // address (or a name that rebinds to one).
  let current = (await assertPublicFetchUrl(url)).href;
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const res = await fetch(current, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        "user-agent": USER_AGENT,
        accept,
        "accept-language": "en-US,en;q=0.9",
        ...extraHeaders,
      },
    });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      await res.arrayBuffer().catch(() => undefined);
      if (!location) throw new Error("That page redirected to an invalid address.");
      let next: string;
      try {
        next = new URL(location, current).href;
      } catch {
        throw new Error("That page redirected to an invalid address.");
      }
      try {
        current = (await assertPublicFetchUrl(next)).href;
      } catch {
        throw new Error("That page redirected to an address that cannot be fetched.");
      }
      if (hop === maxRedirects) throw new Error("That page redirected too many times.");
      continue;
    }
    if (!res.ok) {
      throw new Error(`The page returned ${res.status}.`);
    }
    // Validate the final URL after any server-side internal rewrites.
    try {
      const finalHref = res.url || current;
      current = (await assertPublicFetchUrl(finalHref)).href;
    } catch {
      throw new Error("That address cannot be fetched.");
    }
    const contentType = res.headers.get("content-type") ?? "";
    const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > MAX_HTML_BYTES) {
    throw new Error("That page is too large to convert.");
  }
  const text = new TextDecoder("utf-8").decode(buf);
    return { text, finalUrl: current, contentType };
  }
  throw new Error("That page redirected too many times.");
}

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
    const article = url.pathname.match(/\/(?:i\/)?(?:[^/]+\/)?article\/(\d+)/) || url.pathname.match(/\/article\/(\d+)/);
    if (article?.[1]) return { kind: "x-article", id: article[1], url };
  }
  return { kind: "web", url };
}

function textFromHtml(html: string): string {
  return decodeBasicEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function countWords(text: string): number {
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

function excerptOf(text: string, max = 220): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  const cut = slice.lastIndexOf(" ");
  return `${(cut > 80 ? slice.slice(0, cut) : slice).trim()}…`;
}

const ALLOWED_TAGS = new Set([
  "P",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "BLOCKQUOTE",
  "UL",
  "OL",
  "LI",
  "STRONG",
  "EM",
  "B",
  "I",
  "A",
  "IMG",
  "FIGURE",
  "FIGCAPTION",
  "PRE",
  "CODE",
  "BR",
  "HR",
  "DIV",
  "SPAN",
  "TABLE",
  "THEAD",
  "TBODY",
  "TR",
  "TH",
  "TD",
  "SUP",
  "SUB",
]);

/** Drop entirely (do not unwrap children — nested payloads can stay dangerous). */
const FORBIDDEN_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "IFRAME",
  "OBJECT",
  "EMBED",
  "APPLET",
  "NOSCRIPT",
  "SVG",
  "MATH",
  "LINK",
  "META",
  "BASE",
  "FORM",
  "INPUT",
  "BUTTON",
  "TEXTAREA",
  "SELECT",
  "OPTION",
  "TEMPLATE",
  "FOREIGNOBJECT",
]);

function sanitizeHtml(html: string, baseUrl: string): string {
  const { document } = parseHTML(`<div id="root">${html}</div>`);
  const root = document.getElementById("root");
  if (!root) return "";

  const walk = (node: Element) => {
    const children = Array.from(node.childNodes);
    for (const child of children) {
      if (child.nodeType === 8) {
        child.remove();
        continue;
      }
      if (child.nodeType !== 1) continue;
      const el = child as Element;
      const tag = el.tagName.toUpperCase();
      if (FORBIDDEN_TAGS.has(tag)) {
        el.remove();
        continue;
      }
      walk(el);
      if (tag === "A" && (el.textContent || "").trim().toLowerCase() === "edit") {
        el.remove();
        continue;
      }
      if (!ALLOWED_TAGS.has(tag)) {
        const parent = el.parentNode;
        if (parent) {
          while (el.firstChild) parent.insertBefore(el.firstChild, el);
          el.remove();
        }
        continue;
      }
      const keep = new Map<string, string>();
      if (tag === "A") {
        const href = el.getAttribute("href");
        if (href) {
          const abs = absoluteUrl(href, baseUrl);
          if (abs) keep.set("href", abs);
        }
      }
      if (tag === "IMG") {
        const abs = pickImageSrc(el, baseUrl);
        if (!abs) {
          el.remove();
          continue;
        }
        keep.set("src", abs);
        const alt = el.getAttribute("alt");
        if (alt) keep.set("alt", alt);
      }
      for (const attr of Array.from(el.attributes)) {
        el.removeAttribute(attr.name);
      }
      for (const [k, v] of keep) el.setAttribute(k, v);
    }
  };

  walk(root);
  return root.innerHTML.trim();
}

function tweetTextToHtml(text: string, baseUrl: string): string {
  const escaped = xmlEscape(text);
  const linked = escaped.replace(
    /(https?:\/\/[^\s<]+)/g,
    (url) => `<a href="${url}">${url}</a>`,
  );
  const withHandles = linked.replace(
    /(^|[\s])@([A-Za-z0-9_]+)/g,
    `$1<a href="https://x.com/$2">@$2</a>`,
  );
  const paragraphs = withHandles
    .split(/\n{2,}/)
    .map((block) => `<p>${block.replace(/\n/g, "<br/>")}</p>`)
    .join("");
  return sanitizeHtml(paragraphs, baseUrl);
}

function formatTweetDate(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value > 10_000_000_000 ? value : value * 1000;
    return new Date(ms).toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return null;
}

type FxTweet = {
  id?: string;
  url?: string;
  text?: string;
  raw_text?: { text?: string };
  author?: { name?: string; screen_name?: string };
  created_at?: string;
  created_timestamp?: number;
  media?: { photos?: { url?: string; altText?: string }[] };
  quote?: FxTweet;
  article?: FxXArticle;
};

function tweetToArticle(tweet: FxTweet, sourceUrl: string): Article | null {
  if (tweet.article?.content?.blocks?.length) {
    const html = xArticleBlocksToHtml(tweet.article);
    const handle = tweet.author?.screen_name ? `@${tweet.author.screen_name}` : "";
    const author = tweet.author?.name
      ? `${tweet.author.name}${handle ? ` (${handle})` : ""}`
      : handle || "X";
    const canonical = tweet.url || sourceUrl;
    const cover = tweet.article.cover_media?.media_info?.original_img_url ?? null;
    return buildArticle({
      url: sourceUrl,
      canonicalUrl: canonical,
      title: tweet.article.title || "X article",
      author,
      siteName: "X",
      published: formatTweetDate(tweet.created_timestamp ?? tweet.created_at),
      contentHtml: html,
      source: "x",
      heroImage: cover,
    });
  }

  const text = (tweet.text || tweet.raw_text?.text || "").trim();
  if (!text || isBareXArticleLink(text)) return null;
  const handle = tweet.author?.screen_name ? `@${tweet.author.screen_name}` : "";
  const author = tweet.author?.name
    ? `${tweet.author.name}${handle ? ` (${handle})` : ""}`
    : handle || "X";
  const canonical = tweet.url || sourceUrl;
  const photos = tweet.media?.photos ?? [];
  const figures = photos
    .map((photo) => {
      if (!photo.url) return "";
      const alt = xmlEscape(photo.altText || "Posted image");
      return `<figure><img src="${xmlEscape(photo.url)}" alt="${alt}"/></figure>`;
    })
    .join("");
  let quoteHtml = "";
  if (tweet.quote?.text) {
    const qAuthor = tweet.quote.author?.screen_name
      ? `@${tweet.quote.author.screen_name}`
      : tweet.quote.author?.name || "quoted post";
    quoteHtml = `<blockquote><p><strong>${xmlEscape(qAuthor)}</strong></p>${tweetTextToHtml(tweet.quote.text, canonical)}</blockquote>`;
  }
  const contentHtml = sanitizeHtml(
    `${tweetTextToHtml(text, canonical)}${quoteHtml}${figures}`,
    canonical,
  );
  const plain = textFromHtml(contentHtml);
  const words = countWords(plain);
  if (!plain) return null;
  return {
    url: sourceUrl,
    canonicalUrl: canonical,
    title: excerptOf(text.replace(/\s+/g, " "), 90),
    author,
    siteName: "X",
    published: formatTweetDate(tweet.created_timestamp ?? tweet.created_at),
    excerpt: excerptOf(plain),
    contentHtml,
    wordCount: words,
    readingMinutes: Math.max(1, Math.round(words / 200)),
    source: "x",
    heroImage: photos[0]?.url ?? null,
  };
}

async function extractTweet(id: string, sourceUrl: string): Promise<Article | null> {
  const endpoints = [
    `https://api.fxtwitter.com/status/${id}`,
    `https://api.vxtwitter.com/Twitter/status/${id}`,
  ];
  for (const endpoint of endpoints) {
    try {
      const { text } = await fetchText(endpoint, "application/json");
      const json = JSON.parse(text) as { tweet?: FxTweet; text?: string; user_name?: string; user_screen_name?: string; date?: string; media_extended?: { type?: string; url?: string }[]; tweetURL?: string };
      if (json.tweet) {
        const article = tweetToArticle(json.tweet, sourceUrl);
        if (article) return article;
      }
      if (typeof json.text === "string" && json.text.trim()) {
        const fake: FxTweet = {
          text: json.text,
          url: json.tweetURL || sourceUrl,
          author: { name: json.user_name, screen_name: json.user_screen_name },
          created_at: json.date,
          media: {
            photos: (json.media_extended ?? [])
              .filter((m) => m.type === "image" && m.url)
              .map((m) => ({ url: m.url })),
          },
        };
        const article = tweetToArticle(fake, sourceUrl);
        if (article) return article;
      }
    } catch {
      // try next
    }
  }

  try {
    const oembedUrl = `https://publish.twitter.com/oembed?omit_script=1&dnt=1&url=${encodeURIComponent(sourceUrl)}`;
    const { text } = await fetchText(oembedUrl, "application/json");
    const json = JSON.parse(text) as { html?: string; author_name?: string; author_url?: string };
    if (json.html) {
      const { document } = parseHTML(`<div id="root">${json.html}</div>`);
      const plain = (document.getElementById("root")?.textContent ?? "").replace(/\s+/g, " ").trim();
      if (plain) {
        const contentHtml = tweetTextToHtml(plain, sourceUrl);
        const words = countWords(plain);
        return {
          url: sourceUrl,
          canonicalUrl: sourceUrl,
          title: excerptOf(plain, 90),
          author: json.author_name || "X",
          siteName: "X",
          published: null,
          excerpt: excerptOf(plain),
          contentHtml,
          wordCount: words,
          readingMinutes: Math.max(1, Math.round(words / 200)),
          source: "x",
          heroImage: null,
        };
      }
    }
  } catch {
    // fall through to page fetch
  }
  return null;
}

function metaContent(document: Document, selectors: string[]): string {
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    const content =
      el?.getAttribute("content") ||
      el?.getAttribute("href") ||
      el?.textContent ||
      "";
    if (content.trim()) return content.trim();
  }
  return "";
}

function extractJsonLd(document: Document): { title?: string; author?: string; date?: string; image?: string } {
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
              ? author.map((a) => a?.name).filter(Boolean).join(", ")
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

function buildArticle(params: {
  url: string;
  canonicalUrl: string;
  title: string;
  author: string;
  siteName: string;
  published: string | null;
  contentHtml: string;
  source: Article["source"];
  heroImage: string | null;
}): Article | null {
  const contentHtml = sanitizeHtml(params.contentHtml, params.canonicalUrl);
  const plain = textFromHtml(contentHtml);
  const words = countWords(plain);
  if (params.source !== "x" && words < 40) return null;
  if (!plain) return null;
  return {
    url: params.url,
    canonicalUrl: params.canonicalUrl,
    title: params.title.trim() || excerptOf(plain, 90),
    author: params.author.trim(),
    siteName: params.siteName.trim() || new URL(params.canonicalUrl).hostname.replace(/^www\./, ""),
    published: params.published,
    excerpt: excerptOf(plain),
    contentHtml,
    wordCount: words,
    readingMinutes: Math.max(1, Math.round(words / 200)),
    source: params.source,
    heroImage: params.heroImage ? preferReadableImage(params.heroImage) : null,
  };
}

function readabilityFromHtml(html: string, pageUrl: string, source: Article["source"]): Article | null {
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
  const ogSite = metaContent(document as unknown as Document, [
    'meta[property="og:site_name"]',
  ]);
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

  let parsed: { title?: string | null; byline?: string | null; content?: string | null; excerpt?: string | null } | null = null;
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
  const published = formatTweetDate(ld.date || ogDate);
  const hero = ld.image || ogImage || null;

  return buildArticle({
    url: pageUrl,
    canonicalUrl: pageUrl,
    title,
    author,
    siteName: ogSite,
    published,
    contentHtml:
      contentHtml ||
      (title ? `<p>${xmlEscape(textFromHtml(html).slice(0, 4000))}</p>` : ""),
    source,
    heroImage: hero ? absoluteUrl(hero, pageUrl) : null,
  });
}

function markdownToHtml(md: string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let para: string[] = [];
  let list: string[] = [];
  const flushPara = () => {
    if (!para.length) return;
    out.push(`<p>${para.join("<br/>")}</p>`);
    para = [];
  };
  const flushList = () => {
    if (!list.length) return;
    out.push(`<ul>${list.map((item) => `<li>${item}</li>`).join("")}</ul>`);
    list = [];
  };
  const inline = (s: string) => {
    // Protect inline `code` spans from further markdown processing.
    const codeSpans: string[] = [];
    const protected_ = s.replace(/`([^`]+)`/g, (_, code: string) => {
      codeSpans.push(`<code>${xmlEscape(code)}</code>`);
      return `@@INLINECODE${codeSpans.length - 1}@@`;
    });
    const formatted = xmlEscape(protected_)
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, `<img alt="$1" src="$2"/>`)
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, `<a href="$2">$1</a>`)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(/@@INLINECODE(\d+)@@/g, (_, i: string) => codeSpans[Number(i)] ?? "");
    // Restore any code spans whose <code> tags got entity-escaped.
    return formatted
      .replace(/&lt;code&gt;/g, "<code>")
      .replace(/&lt;\/code&gt;/g, "</code>");
  };

  let inFence = false;
  let fenceBuf: string[] = [];
  const flushFence = () => {
    if (!fenceBuf.length) return;
    // Strip one leading/trailing blank line (common in fences) but keep indentation.
    while (fenceBuf.length && !fenceBuf[0].trim()) fenceBuf.shift();
    while (fenceBuf.length && !fenceBuf[fenceBuf.length - 1].trim()) fenceBuf.pop();
    out.push(`<pre><code>${xmlEscape(fenceBuf.join("\n"))}</code></pre>`);
    fenceBuf = [];
  };

  const splitTableRow = (line: string): string[] | null => {
    const trimmed = line.trim();
    if (!trimmed.includes("|")) return null;
    // Strip optional leading/trailing pipes, then split on unescaped pipes.
    const inner = trimmed.replace(/^\||\|$/g, "").trim();
    if (!inner) return null;
    const cells: string[] = [];
    let current = "";
    let escaped = false;
    for (const ch of inner) {
      if (escaped) {
        current += ch;
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === "|") {
        cells.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    cells.push(current.trim());
    if (cells.length < 2) return null;
    return cells;
  };
  const isTableDelimiter = (line: string): boolean => {
    const cells = splitTableRow(line);
    if (!cells || cells.length < 2) return false;
    return cells.every((c) => /^:?-+:?$/.test(c.trim()));
  };

  for (let li = 0; li < lines.length; li += 1) {
    const raw = lines[li];
    const line = raw.trimEnd();
    if (/^```/.test(line.trim())) {
      if (inFence) {
        flushFence();
        inFence = false;
      } else {
        flushPara();
        flushList();
        inFence = true;
        fenceBuf = [];
      }
      continue;
    }
    if (inFence) {
      fenceBuf.push(raw.replace(/\r$/, ""));
      continue;
    }
    if (!line.trim()) {
      flushPara();
      flushList();
      continue;
    }
    // GitHub-style pipe tables: header row + delimiter row + body rows.
    if (line.includes("|")) {
      const headerCells = splitTableRow(line);
      const nextLine = li + 1 < lines.length ? (lines[li + 1] ?? "") : "";
      if (headerCells && isTableDelimiter(nextLine)) {
        const bodyRows: string[][] = [];
        let cursor = li + 2;
        while (cursor < lines.length) {
          const candidate = lines[cursor] ?? "";
          if (!candidate.trim() || !candidate.includes("|")) break;
          if (/^```/.test(candidate.trim())) break;
          const cells = splitTableRow(candidate);
          if (!cells) break;
          bodyRows.push(cells);
          cursor += 1;
        }
        flushPara();
        flushList();
        const colCount = headerCells.length;
        const normalize = (cells: string[]) => {
          const out = cells.slice(0, colCount);
          while (out.length < colCount) out.push("");
          return out;
        };
        const thead = `<thead><tr>${normalize(headerCells).map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead>`;
        const tbody =
          bodyRows.length > 0
            ? `<tbody>${bodyRows.map((row) => `<tr>${normalize(row).map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody>`
            : "";
        out.push(`<table>${thead}${tbody}</table>`);
        li = cursor - 1;
        continue;
      }
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      flushPara();
      flushList();
      const level = heading[1].length;
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }
    if (/^>\s?/.test(line)) {
      flushPara();
      flushList();
      out.push(`<blockquote><p>${inline(line.replace(/^>\s?/, ""))}</p></blockquote>`);
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      flushPara();
      list.push(inline(line.replace(/^[-*]\s+/, "")));
      continue;
    }
    para.push(inline(line.trim()));
  }
  if (inFence) flushFence();
  flushPara();
  flushList();
  return out.join("");
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
    `<p><em>Saved as a link.</em> Automatic capture was blocked — open the original, or paste the article / use the KAMI bookmarklet.</p><p><a href="${href.replace(/"/g, "&quot;")}">Open original</a></p>`,
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
  let href = "https://imported.local/article";
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

export async function extractArticleFromUrl(rawUrl: string): Promise<ExtractResult> {
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

  if (!challenge) {
    const fromDom = readabilityFromHtml(fetched.text, fetched.finalUrl || pageUrl.href, source);
    if (fromDom) return { ok: true, article: fromDom };
  }

  const viaJina = await extractViaJina(fetched.finalUrl || pageUrl.href);
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

export { assertPublicHttpUrl, fetchText, sanitizeHtml, USER_AGENT, FETCH_TIMEOUT_MS };
