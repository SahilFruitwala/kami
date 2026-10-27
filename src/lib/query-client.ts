import { QueryClient } from "@tanstack/react-query";
import type { ItemStatus } from "@/lib/schema";
import type { ShelfTab } from "@/lib/shelves.ts";

/**
 * Shared React Query client. Shelves lists/lookups are the primary consumers;
 * the article library stays on zustand (optimistic writes + offline outbox).
 */
export function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });
}

let browserClient: QueryClient | null = null;

/** One client per browser tab; fresh instance on the server for SSR. */
export function getAppQueryClient() {
  if (typeof window === "undefined") return createAppQueryClient();
  if (!browserClient) browserClient = createAppQueryClient();
  return browserClient;
}

export const queryKeys = {
  narration: {
    all: ["narration"] as const,
    allowance: () => [...queryKeys.narration.all, "allowance"] as const,
    article: (articleId: string) => [...queryKeys.narration.all, "article", articleId] as const,
  },
  library: {
    all: ["library"] as const,
    /** The one-time library boot for a signed-in user (see useLibraryBoot). */
    boot: (userId: string) => [...queryKeys.library.all, "boot", userId] as const,
  },
  ai: {
    all: ["ai"] as const,
    status: () => [...queryKeys.ai.all, "status"] as const,
    summary: (articleId: string) => [...queryKeys.ai.all, "summary", articleId] as const,
  },
  extracts: {
    all: ["extracts"] as const,
    overview: () => [...queryKeys.extracts.all, "overview"] as const,
    results: (sourceId: string) => [...queryKeys.extracts.all, "results", sourceId] as const,
  },
  trips: {
    all: ["trips"] as const,
    list: () => [...queryKeys.trips.all, "list"] as const,
    detail: (id: string) => [...queryKeys.trips.all, "detail", id] as const,
    chat: (id: string) => [...queryKeys.trips.all, "chat", id] as const,
  },
  research: {
    all: ["research"] as const,
    status: () => [...queryKeys.research.all, "status"] as const,
    credits: () => [...queryKeys.research.all, "credits"] as const,
    topics: () => [...queryKeys.research.all, "topics"] as const,
    topic: (id: string) => [...queryKeys.research.all, "topic", id] as const,
    ideas: (topicId: string, status: string) =>
      [...queryKeys.research.all, "ideas", topicId, status] as const,
    idea: (id: string) => [...queryKeys.research.all, "idea", id] as const,
    sources: (topicId: string) => [...queryKeys.research.all, "sources", topicId] as const,
    run: (id: string) => [...queryKeys.research.all, "run", id] as const,
  },
  feeds: {
    all: ["feeds"] as const,
    overview: () => [...queryKeys.feeds.all, "overview"] as const,
    entriesAll: () => [...queryKeys.feeds.all, "entries"] as const,
    entries: (view: string, feedId: string | null) =>
      [...queryKeys.feeds.all, "entries", view, feedId ?? "all"] as const,
  },
  shelves: {
    all: ["shelves"] as const,
    counts: () => [...queryKeys.shelves.all, "counts"] as const,
    list: (args: { type: ShelfTab; status?: ItemStatus; query: string; limit: number }) =>
      [
        ...queryKeys.shelves.all,
        "list",
        args.type,
        args.status ?? "all",
        args.query,
        args.limit,
      ] as const,
    detail: (type: ShelfTab, id: string) => [...queryKeys.shelves.all, "detail", type, id] as const,
    seasons: (itemId: string) => [...queryKeys.shelves.all, "seasons", itemId] as const,
    /** Every season's episode list for one show (invalidation prefix). */
    episodesAll: (itemId: string) => [...queryKeys.shelves.all, "episodes", itemId] as const,
    episodes: (itemId: string, season: number) =>
      [...queryKeys.shelves.all, "episodes", itemId, season] as const,
    pageCount: (bookId: string) => [...queryKeys.shelves.all, "page-count", bookId] as const,
  },
  lookup: {
    all: ["lookup"] as const,
    tmdb: (kind: "movie" | "tv", query: string) =>
      [...queryKeys.lookup.all, "tmdb", kind, query] as const,
    books: (query: string) => [...queryKeys.lookup.all, "books", query] as const,
    link: (url: string) => [...queryKeys.lookup.all, "link", url] as const,
    watchProviders: (kind: "movie" | "tv", tmdbId: string) =>
      [...queryKeys.lookup.all, "watch-providers", kind, tmdbId] as const,
  },
} as const;

/** Invalidate every shelves list/count after an add (⌘K or Add dialog). */
export function invalidateShelves(client: QueryClient) {
  return client.invalidateQueries({ queryKey: queryKeys.shelves.all });
}
