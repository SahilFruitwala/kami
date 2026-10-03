import type { Article } from "./article-types.ts";
import { preferReadableImage } from "./image-url.ts";
import { decodeBasicEntities } from "./xml.ts";

import { sanitizeHtml } from "./sanitize-html.server.ts";

export function textFromHtml(html: string): string {
  return decodeBasicEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

export function countWords(text: string): number {
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

export function excerptOf(text: string, max = 220): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  const cut = slice.lastIndexOf(" ");
  return `${(cut > 80 ? slice.slice(0, cut) : slice).trim()}…`;
}

export function buildArticle(params: {
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
