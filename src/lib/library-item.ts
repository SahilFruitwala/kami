import type { Article, ArticleSource } from "./article-types.ts";
import { isHttpUrl } from "./safe-url.ts";
import type { TidyState } from "./tidy-state.ts";

/**
 * The library's domain model: item/highlight/folder shapes, their size
 * limits, and pure helpers. Isomorphic (no React, no store, no DB) so the
 * client store, the API contracts and the server services all share it.
 */

/**
 * Size limits for library rows. The server's Zod schemas, the server-side
 * clamps and the client's optimistic writes all read these, so a row the
 * client keeps locally is exactly the row the server stores.
 */
export const LIBRARY_LIMITS = {
  id: 2000,
  url: 2000,
  title: 500,
  author: 300,
  siteName: 200,
  excerpt: 4000,
  contentHtml: 1_500_000,
  heroImage: 2000,
  published: 100,
  note: 2000,
  tags: 12,
  tagLength: 28,
  highlights: 80,
  highlightText: 800,
  /** Longest marginalia note kept on a single highlight. */
  highlightNote: 1000,
  folders: 24,
  folderName: 32,
} as const;

/** Ink colors for highlights — Dokusho toolbar (Vermilion / Bamboo / Sumi). */
export const HIGHLIGHT_COLORS = [
  { id: "vermilion", label: "Vermilion", swatch: "#c84b31" },
  { id: "bamboo", label: "Bamboo", swatch: "#6e7d6a" },
  { id: "sumi", label: "Sumi", swatch: "#43403a" },
] as const;

export type HighlightColorId = (typeof HIGHLIGHT_COLORS)[number]["id"];

export type Highlight = {
  id: string;
  text: string;
  note: string;
  createdAt: number;
  color: HighlightColorId;
};

export type Folder = {
  id: string;
  name: string;
};

export type LibraryItem = {
  id: string;
  url: string;
  canonicalUrl: string;
  title: string;
  author: string;
  siteName: string;
  source: ArticleSource;
  wordCount: number;
  readingMinutes: number;
  excerpt: string;
  contentHtml: string;
  heroImage: string | null;
  published: string | null;
  savedAt: number;
  archived: boolean;
  tags: string[];
  folderId: string | null;
  highlights: Highlight[];
  favorited: boolean;
  note: string;
  /** Server-owned: where the saved copy is in the Tidy lifecycle. */
  tidyState?: TidyState;
  /** Server-owned: an Original copy exists and can be restored. */
  hasOriginal?: boolean;
};

export function articleIdFromUrl(url: string): string {
  return url.replace(/#.*$/, "");
}

export function normalizeTag(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, LIBRARY_LIMITS.tagLength);
}

export function itemToArticle(item: LibraryItem): Article {
  return {
    url: item.url,
    canonicalUrl: item.canonicalUrl || item.url,
    title: item.title,
    author: item.author,
    siteName: item.siteName,
    published: item.published,
    excerpt: item.excerpt,
    contentHtml: item.contentHtml,
    wordCount: item.wordCount,
    readingMinutes: item.readingMinutes,
    source: item.source,
    heroImage: item.heroImage,
  };
}

export function articleToItem(article: Article, extras: Partial<LibraryItem> = {}): LibraryItem {
  const now = Date.now();
  return {
    id: articleIdFromUrl(article.canonicalUrl || article.url),
    url: article.url,
    canonicalUrl: article.canonicalUrl || article.url,
    title: article.title,
    author: article.author,
    siteName: article.siteName,
    source: article.source,
    wordCount: article.wordCount,
    readingMinutes: article.readingMinutes,
    excerpt: article.excerpt,
    contentHtml: article.contentHtml,
    heroImage: article.heroImage,
    published: article.published,
    savedAt: now,
    archived: false,
    tags: [],
    folderId: null,
    highlights: [],
    favorited: false,
    note: "",
    ...extras,
  };
}

/**
 * Clamp a library item's fields to `LIBRARY_LIMITS` (title falls back to
 * "Untitled"; an oversize or non-http hero image is dropped). Tolerates
 * untyped input so it can run as a Zod preprocess step: an oversize og:image
 * or title must be trimmed, not hard-fail the save.
 */
export function clampLibraryItem(input: LibraryItem): LibraryItem;
export function clampLibraryItem(input: unknown): unknown;
export function clampLibraryItem(input: unknown): unknown {
  if (!input || typeof input !== "object") return input;
  const o = input as Record<string, unknown>;
  const L = LIBRARY_LIMITS;
  const cut = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : v);
  const title = typeof o.title === "string" ? o.title : o.title == null ? o.title : String(o.title);
  const hero = typeof o.heroImage === "string" ? o.heroImage : undefined;
  return {
    ...o,
    title: typeof title === "string" ? title.trim().slice(0, L.title) || "Untitled" : o.title,
    author: cut(o.author, L.author),
    siteName: cut(o.siteName, L.siteName),
    excerpt: cut(o.excerpt, L.excerpt),
    contentHtml: cut(o.contentHtml, L.contentHtml),
    heroImage:
      hero === undefined
        ? o.heroImage
        : hero.length <= L.heroImage && isHttpUrl(hero)
          ? hero
          : null,
    published: cut(o.published, L.published),
    note: cut(o.note, L.note),
    tags: Array.isArray(o.tags) ? o.tags.slice(0, L.tags) : o.tags,
    highlights: Array.isArray(o.highlights) ? o.highlights.slice(0, L.highlights) : o.highlights,
  };
}
