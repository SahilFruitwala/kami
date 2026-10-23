import { http, seg } from "./client";
import type { LibraryItem } from "@/lib/library-item";

/** Which AI features this server can run (each needs a provider key). */
export type AiStatus = { enabled: boolean };

/** An article's AI summary and organisation suggestions. */
export type ArticleSummary = {
  tldr: string;
  keyPoints: string[];
  /** Suggested existing folder, or null. */
  folderId: string | null;
  /** Made from only the first part of a piece too long to send whole. */
  clipped: boolean;
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

/** A clean-up that has already been saved. */
export type TidyResult = {
  /** The article as saved now (its body is the cleaned copy). */
  item: LibraryItem;
  /** The body as it was before this clean-up. */
  originalHtml: string;
  /** A short preview of each block taken out, in order. */
  removed: string[];
};

export const aiApi = {
  status: () => http.get<AiStatus>("/api/ai/status"),

  /** Cached summary, or null when none was made yet. */
  summary: (articleId: string) =>
    http.get<ArticleSummary | null>(`/api/ai/articles/${seg(articleId)}/summary`),
  /** Strip sponsor blocks, prompts and footers from a saved copy and save it. */
  tidy: (articleId: string) => http.post<TidyResult>(`/api/ai/articles/${seg(articleId)}/tidy`),

  /** The copy as it was saved, before the clean-up. */
  original: (articleId: string) =>
    http.get<{ originalHtml: string }>(`/api/ai/articles/${seg(articleId)}/original`),

  /** Put back the copy as it was before the clean-up. */
  restoreOriginal: (articleId: string) =>
    http.post<LibraryItem>(`/api/ai/articles/${seg(articleId)}/restore-original`),

  /** Tag an article with up to three fixed categories; returns its full tag list. */
  autoTag: (articleId: string) =>
    http.post<{ tags: string[] }>(`/api/ai/articles/${seg(articleId)}/autotag`),

  /** File the next few untagged, unfiled articles; `exclude` lists ids already tried. */
  organize: (exclude: string[] = []) =>
    http.post<OrganizeProgress>("/api/ai/organize", { exclude }),

  /** Generate (or regenerate) and cache the summary. */
  summarize: (articleId: string) =>
    http.post<ArticleSummary>(`/api/ai/articles/${seg(articleId)}/summary`),
};
