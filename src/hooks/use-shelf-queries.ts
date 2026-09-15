import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addShelfItem,
  findShelfDuplicates,
  getShelfCounts,
  getShelfItem,
  listShelfItems,
  type ShelfTab,
} from "@/lib/shelves-fns";
import {
  fetchLinkPreview,
  searchBooks,
  searchTmdb,
} from "@/lib/shelves-lookup";
import { invalidateShelves, queryKeys } from "@/lib/query-client";

export function useShelfCounts() {
  return useQuery({
    queryKey: queryKeys.shelves.counts(),
    queryFn: () => getShelfCounts(),
  });
}

export function useShelfItems(args: {
  type: ShelfTab;
  status?: "to_try" | "done" | "abandoned";
  query: string;
}) {
  return useQuery({
    queryKey: queryKeys.shelves.list(args),
    queryFn: () =>
      listShelfItems({
        data: {
          type: args.type,
          status: args.status,
          query: args.query,
          limit: 120,
          offset: 0,
        },
      }),
    placeholderData: (prev) => prev,
  });
}

export function useShelfDetail(type: ShelfTab, id: string | null) {
  return useQuery({
    queryKey: queryKeys.shelves.detail(type, id ?? ""),
    queryFn: () => getShelfItem({ data: { type, id: id! } }),
    enabled: Boolean(id),
  });
}

export function useTmdbSearch(
  kind: "movie" | "tv",
  query: string,
  enabled: boolean,
) {
  const q = query.trim();
  return useQuery({
    queryKey: queryKeys.lookup.tmdb(kind, q),
    queryFn: () => searchTmdb({ data: { query: q, kind } }),
    enabled: enabled && q.length >= 2,
  });
}

export function useBookSearch(query: string, enabled: boolean) {
  const q = query.trim();
  return useQuery({
    queryKey: queryKeys.lookup.books(q),
    queryFn: () => searchBooks({ data: q }),
    enabled: enabled && q.length >= 2,
  });
}

export function useLinkPreview(url: string, enabled: boolean) {
  const href = url.trim();
  return useQuery({
    queryKey: queryKeys.lookup.link(href),
    queryFn: () => fetchLinkPreview({ data: href }),
    enabled: enabled && href.length >= 4,
  });
}

export function useAddShelfItem() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      type: ShelfTab | "restaurant" | "place";
      title: string;
      notes?: string;
      link?: string;
      imageUrl?: string;
      metadata?: Record<string, string>;
      status?: "to_try" | "done";
    }) => addShelfItem({ data }),
    onSuccess: () => invalidateShelves(client),
  });
}

export function useFindShelfDuplicates() {
  return useMutation({
    mutationFn: (data: { type: ShelfTab; title: string }) =>
      findShelfDuplicates({ data }),
  });
}
