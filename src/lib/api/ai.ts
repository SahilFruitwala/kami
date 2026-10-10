import { http, seg } from "./client";
import type { LookupResult } from "./types";

/** Which AI features this server can run (each needs a provider key). */
export type AiStatus = { enabled: boolean; semanticSearch: boolean };

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

/** Where a library search hit or an Ask citation comes from. */
export type LibrarySource = {
  kind: "article" | "highlights";
  articleId: string;
  title: string;
  subtitle?: string;
};

export type LibraryHit = LibrarySource & { snippet: string; score: number };

export type LibrarySearch = {
  /** False when results come from keyword search (no pgvector / embedding key). */
  semantic: boolean;
  hits: LibraryHit[];
};

export type IndexProgress = { enabled: boolean; indexed: number; remaining: number };

/** Metadata on an Ask reply: the numbered sources it may cite. */
export type AskMetadata = { sources?: Array<LibrarySource & { n: number }> };

/** A highlight sent to the vault helpers. */
export type VaultSlipInput = {
  /** The highlight id; results refer back to it. */
  id: string;
  text: string;
  note: string;
  title: string;
  author: string;
};

export type VaultThemes = {
  themes: Array<{ title: string; insight: string; slipIds: string[] }>;
  connections: Array<{ insight: string; slipIds: string[] }>;
  questions: string[];
};

export type VaultFlashcard = { front: string; back: string; slipId: string };

/** "Your week in reading" on the desk. */
export type WeeklyRecap = {
  /** Range covered (YYYY-MM-DD, UTC). */
  from: string;
  to: string;
  stats: { saved: number; finished: number; highlights: number };
  recap: string;
  themes: string[];
  standout: { text: string; articleId: string; title: string } | null;
  prompt: string;
  nextRead: { articleId: string; title: string; reason: string } | null;
  model: string | null;
  createdAt: number;
};

/** A tidied copy of an article (not saved until the reader applies it). */
export type TidyResult = { contentHtml: string; removed: string[] };

/** A digest of unread feed entries. */
export type FeedDigest = {
  feedId: string | null;
  entryCount: number;
  overview: string;
  picks: Array<{ entryId: string; title: string; feedTitle: string; why: string }>;
  topics: Array<{
    title: string;
    summary: string;
    entries: Array<{ entryId: string; title: string }>;
  }>;
  /** Entries the model judged safe to skip. */
  skipIds: string[];
  model: string | null;
  createdAt: number;
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

export const aiApi = {
  status: () => http.get<AiStatus>("/api/ai/status"),

  /** Search the library by meaning (keywords when semantic search is off). */
  search: (q: string, signal?: AbortSignal) =>
    http.get<LibrarySearch>("/api/ai/search", { q }, signal),
  /** Embed the next batch of new or changed items for semantic search. */
  index: () => http.post<IndexProgress>("/api/ai/embed"),
  /** Streaming "Ask your library" chat endpoint. */
  askUrl: "/api/ai/ask",

  /** Cached summary, or null when none was made yet. */
  summary: (articleId: string) =>
    http.get<ArticleSummary | null>(`/api/ai/articles/${seg(articleId)}/summary`),
  /** Streaming chat endpoint for an article (used with the AI SDK's useChat). */
  articleChatUrl: (articleId: string) => `/api/ai/articles/${seg(articleId)}/chat`,

  /** Themes and connections across the given highlights. */
  vaultThemes: (slips: VaultSlipInput[]) =>
    http.post<VaultThemes>("/api/ai/vault/themes", { slips }),
  /** Study flashcards from the given highlights. */
  vaultFlashcards: (slips: VaultSlipInput[]) =>
    http.post<{ cards: VaultFlashcard[] }>("/api/ai/vault/flashcards", { slips }),
  /** A draft margin note for one highlight. */
  draftNote: (articleId: string, text: string) =>
    http.post<{ note: string }>("/api/ai/vault/note", { articleId, text }),

  /** The latest weekly recap, or null. */
  weeklyRecap: () => http.get<WeeklyRecap | null>("/api/ai/recap"),
  /** Make a fresh recap of the past seven days. */
  makeWeeklyRecap: () => http.post<WeeklyRecap>("/api/ai/recap"),

  /** Strip sponsor blocks, prompts and footers from a saved copy (returns HTML, saves nothing). */
  tidy: (articleId: string) => http.post<TidyResult>(`/api/ai/articles/${seg(articleId)}/tidy`),

  /** The stored digest for a feed (or all feeds), or null. */
  feedDigest: (feedId: string | null) =>
    http.get<FeedDigest | null>("/api/ai/feeds/digest", { feedId: feedId ?? undefined }),
  makeFeedDigest: (feedId: string | null) =>
    http.post<FeedDigest>("/api/ai/feeds/digest", { feedId: feedId ?? undefined }),
  /** A short summary of one feed entry (cached). */
  entrySummary: (entryId: string) =>
    http.post<EntrySummary>(`/api/ai/feeds/entries/${seg(entryId)}/summary`),

  /** Draft a trip on the trips board from a saved travel piece. */
  tripFromArticle: (articleId: string) =>
    http.post<{ tripId: string; items: number; hotels: number }>(
      `/api/ai/articles/${seg(articleId)}/trip`,
    ),

  /** Suggestions for a movie, TV or book shelf. */
  recommend: (type: "movie" | "tv" | "book") =>
    http.post<{ recs: ShelfRec[] }>("/api/ai/shelves/recommend", { type }),

  /** Generate (or regenerate) and cache the summary. */
  summarize: (articleId: string) =>
    http.post<ArticleSummary>(`/api/ai/articles/${seg(articleId)}/summary`),
};
