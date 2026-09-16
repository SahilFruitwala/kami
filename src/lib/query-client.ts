import { QueryClient } from "@tanstack/react-query";
import type { ShelfTab } from "@/lib/shelves-fns";

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
  shelves: {
    all: ["shelves"] as const,
    counts: () => [...queryKeys.shelves.all, "counts"] as const,
    list: (args: {
      type: ShelfTab;
      status?: "to_try" | "done" | "abandoned";
      query: string;
    }) =>
      [
        ...queryKeys.shelves.all,
        "list",
        args.type,
        args.status ?? "all",
        args.query,
      ] as const,
    detail: (type: ShelfTab, id: string) =>
      [...queryKeys.shelves.all, "detail", type, id] as const,
    seasons: (itemId: string) =>
      [...queryKeys.shelves.all, "seasons", itemId] as const,
    episodes: (itemId: string, season: number) =>
      [...queryKeys.shelves.all, "episodes", itemId, season] as const,
  },
  lookup: {
    all: ["lookup"] as const,
    tmdb: (kind: "movie" | "tv", query: string) =>
      [...queryKeys.lookup.all, "tmdb", kind, query] as const,
    books: (query: string) => [...queryKeys.lookup.all, "books", query] as const,
    link: (url: string) => [...queryKeys.lookup.all, "link", url] as const,
  },
} as const;

/** Invalidate every shelves list/count after an add (⌘K or Add dialog). */
export function invalidateShelves(client: QueryClient) {
  return client.invalidateQueries({ queryKey: queryKeys.shelves.all });
}
