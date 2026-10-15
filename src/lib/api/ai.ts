import { http, seg } from "./client";
import type { LookupResult } from "./types";

/** Which AI features this server can run (each needs a provider key). */
export type AiStatus = { enabled: boolean };

/** An article's AI summary and organisation suggestions. */
export type ArticleSummary = {
  tldr: string;
  keyPoints: string[];
  /** Suggested tags the article doesn't have yet. */
  tags: string[];
  /** Suggested existing folder, or null. */
  folderId: string | null;
  model: string | null;
  createdAt: number;
  /** The article's text changed since this summary was made. */
  stale: boolean;
};

/** One auto-organise batch: what was filed, and how many untouched articles remain. */
export type OrganizeProgress = {
  enabled: boolean;
  done: Array<{ id: string; tags: string[]; folderId: string | null }>;
  /** Every article this batch looked at, filed or not; send back as `exclude`. */
  attempted: string[];
  remaining: number;
};

/** A tidied copy of an article (not saved until the reader confirms it). */
export type TidyResult = {
  /** The copy as it is saved now. */
  originalHtml: string;
  /** The copy with the clutter taken out. */
  contentHtml: string;
  /** A short preview of each block taken out, in order. */
  removed: string[];
};

export type EntrySummary = { tldr: string; keyPoints: string[] };

/** A suggested movie, show or book, matched to TMDB / Open Library when possible. */
export type ShelfRec = {
  title: string;
  subtitle: string | null;
  why: string;
  /** Lookup match (cover, link, metadata) for a one-tap add; null when none was found. */
  match: LookupResult | null;
};

/** A quick look at a captured page before saving it. */
export type PagePeek = {
  title: string;
  siteName: string;
  url: string;
  readingMinutes: number;
  tldr: string;
  keyPoints: string[];
  verdict: string;
};

export const aiApi = {
  status: () => http.get<AiStatus>("/api/ai/status"),

  /** Cached summary, or null when none was made yet. */
  summary: (articleId: string) =>
    http.get<ArticleSummary | null>(`/api/ai/articles/${seg(articleId)}/summary`),
  /** Strip sponsor blocks, prompts and footers from a saved copy (returns HTML, saves nothing). */
  tidy: (articleId: string) => http.post<TidyResult>(`/api/ai/articles/${seg(articleId)}/tidy`),

  /** Tag an article with up to three fixed categories; returns its full tag list. */
  autoTag: (articleId: string) =>
    http.post<{ tags: string[] }>(`/api/ai/articles/${seg(articleId)}/autotag`),

  /** A short summary of one feed entry (cached). */
  entrySummary: (entryId: string) =>
    http.post<EntrySummary>(`/api/ai/feeds/entries/${seg(entryId)}/summary`),

  /** Summarize a page captured by the extension, without saving it. */
  peek: (page: { url?: string; title: string; html: string }) =>
    http.post<PagePeek>("/api/ai/peek", page),

  /** Suggestions for a movie, TV or book shelf. */
  recommend: (type: "movie" | "tv" | "book") =>
    http.post<{ recs: ShelfRec[] }>("/api/ai/shelves/recommend", { type }),

  /** File the next few untagged, unfiled articles; `exclude` lists ids already tried. */
  organize: (exclude: string[] = []) =>
    http.post<OrganizeProgress>("/api/ai/organize", { exclude }),

  /** Generate (or regenerate) and cache the summary. */
  summarize: (articleId: string) =>
    http.post<ArticleSummary>(`/api/ai/articles/${seg(articleId)}/summary`),
};
