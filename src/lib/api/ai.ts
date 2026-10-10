import { http, seg } from "./client";

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

  /** Generate (or regenerate) and cache the summary. */
  summarize: (articleId: string) =>
    http.post<ArticleSummary>(`/api/ai/articles/${seg(articleId)}/summary`),
};
