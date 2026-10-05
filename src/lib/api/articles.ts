import type { ExtractResult } from "@/lib/article-types";
import { http } from "./client";

/** Article extraction — results are not saved; persist via `libraryApi.upsert`. */
export const articlesApi = {
  /** Fetch + extract a clean copy of a page (rate-limited per user). */
  extract: (url: string) => http.post<ExtractResult>("/api/articles/extract", { url }),

  /** Build an article from pasted HTML/text, or a page captured in the browser. */
  import: (input: {
    url?: string;
    title: string;
    contentHtml?: string;
    contentText?: string;
    capture?: boolean;
  }) => http.post<ExtractResult>("/api/articles/import", input),

  /** Link-only stub — no fetch; the reader extracts on open. */
  link: (url: string, title?: string) =>
    http.post<ExtractResult>("/api/articles/link", { url, title }),
};
