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

export const aiApi = {
  status: () => http.get<AiStatus>("/api/ai/status"),

  /** Cached summary, or null when none was made yet. */
  summary: (articleId: string) =>
    http.get<ArticleSummary | null>(`/api/ai/articles/${seg(articleId)}/summary`),
  /** Streaming chat endpoint for an article (used with the AI SDK's useChat). */
  articleChatUrl: (articleId: string) => `/api/ai/articles/${seg(articleId)}/chat`,

  /** Generate (or regenerate) and cache the summary. */
  summarize: (articleId: string) =>
    http.post<ArticleSummary>(`/api/ai/articles/${seg(articleId)}/summary`),
};
