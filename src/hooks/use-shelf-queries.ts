import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getSeasonEpisodes,
  getShowSeasons,
  setSeasonWatched,
  setShowWatched,
  toggleEpisode,
} from "@/lib/shelves-episodes";
import { getShelfCounts, getShelfItem, listShelfItems } from "@/lib/shelves-fns";
import {
  addShelfItem,
  deleteShelfItem,
  findShelfDuplicates,
  setBookProgress,
  setShelfItemStatus,
} from "@/lib/shelves-write-fns";
import type { ItemStatus } from "@/lib/schema";
import type { ShelfTab } from "@/lib/shelves";
import { fetchLinkPreview, fillBookPageCount, searchBooks, searchTmdb } from "@/lib/shelves-lookup";
import { invalidateShelves, queryKeys } from "@/lib/query-client";

export function useShelfCounts() {
  return useQuery({
    queryKey: queryKeys.shelves.counts(),
    queryFn: () => getShelfCounts(),
  });
}

export const SHELF_PAGE_SIZE = 12;

export function useShelfItems(args: {
  type: ShelfTab;
  status?: ItemStatus;
  query: string;
  limit?: number;
}) {
  const limit = args.limit ?? SHELF_PAGE_SIZE;
  return useQuery({
    queryKey: queryKeys.shelves.list({ ...args, limit }),
    queryFn: () =>
      listShelfItems({
        data: {
          type: args.type,
          status: args.status,
          query: args.query,
          limit,
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

/**
 * Third-party lookups are now cached server-side (Upstash, hours–days), so
 * the client can hold them longer too: repeat hovers / reopens never hit
 * the network within a session.
 */
const LOOKUP_STALE_TIME = 10 * 60_000;
const LOOKUP_GC_TIME = 30 * 60_000;

export function useTmdbSearch(kind: "movie" | "tv", query: string, enabled: boolean) {
  const q = query.trim();
  return useQuery({
    queryKey: queryKeys.lookup.tmdb(kind, q),
    queryFn: () => searchTmdb({ data: { query: q, kind } }),
    enabled: enabled && q.length >= 2,
    staleTime: LOOKUP_STALE_TIME,
    gcTime: LOOKUP_GC_TIME,
  });
}

export function useBookSearch(query: string, enabled: boolean) {
  const q = query.trim();
  return useQuery({
    queryKey: queryKeys.lookup.books(q),
    queryFn: () => searchBooks({ data: q }),
    enabled: enabled && q.length >= 2,
    staleTime: LOOKUP_STALE_TIME,
    gcTime: LOOKUP_GC_TIME,
  });
}

export function useLinkPreview(url: string, enabled: boolean) {
  const href = url.trim();
  return useQuery({
    queryKey: queryKeys.lookup.link(href),
    queryFn: () => fetchLinkPreview({ data: href }),
    enabled: enabled && href.length >= 4,
    staleTime: LOOKUP_STALE_TIME,
    gcTime: LOOKUP_GC_TIME,
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
    mutationFn: (data: { type: ShelfTab; title: string; tmdbId?: string }) =>
      findShelfDuplicates({ data }),
  });
}

export function useSetShelfItemStatus() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (data: { type: ShelfTab; id: string; status: ItemStatus }) =>
      setShelfItemStatus({ data }),
    onSuccess: () => invalidateShelves(client),
  });
}

export function useDeleteShelfItem() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (data: { type: ShelfTab; id: string }) => deleteShelfItem({ data }),
    onSuccess: () => invalidateShelves(client),
  });
}

export function useShowSeasons(itemId: string | null) {
  return useQuery({
    queryKey: queryKeys.shelves.seasons(itemId ?? ""),
    queryFn: () => getShowSeasons({ data: { itemId: itemId! } }),
    enabled: Boolean(itemId),
    staleTime: 60 * 60_000,
  });
}

export function useSeasonEpisodes(itemId: string | null, season: number | null) {
  return useQuery({
    queryKey: queryKeys.shelves.episodes(itemId ?? "", season ?? -1),
    queryFn: () => getSeasonEpisodes({ data: { itemId: itemId!, season: season! } }),
    enabled: Boolean(itemId) && season != null,
    staleTime: 60 * 60_000,
  });
}

export function useToggleEpisode(itemId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (data: { season: number; number: number }) =>
      toggleEpisode({ data: { itemId, ...data } }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't update episodes."),
    onSuccess: () => {
      void invalidateShelves(client);
      void client.invalidateQueries({ queryKey: queryKeys.shelves.seasons(itemId) });
      void client.invalidateQueries({
        queryKey: [...queryKeys.shelves.all, "episodes", itemId],
      });
    },
  });
}

export function useSetSeasonWatched(itemId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (data: { season: number; numbers: number[]; watched: boolean }) =>
      setSeasonWatched({ data: { itemId, ...data } }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't update episodes."),
    onSuccess: () => {
      void invalidateShelves(client);
      void client.invalidateQueries({ queryKey: queryKeys.shelves.seasons(itemId) });
      void client.invalidateQueries({
        queryKey: [...queryKeys.shelves.all, "episodes", itemId],
      });
    },
  });
}

export function useSetShowWatched() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (data: { itemId: string; watched: boolean }) => setShowWatched({ data }),
    onSuccess: (_r, vars) => {
      void invalidateShelves(client);
      void client.invalidateQueries({ queryKey: queryKeys.shelves.seasons(vars.itemId) });
      void client.invalidateQueries({
        queryKey: [...queryKeys.shelves.all, "episodes", vars.itemId],
      });
    },
  });
}

export function useSetBookProgress() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (
      data:
        | { id: string; mode: "pages"; currentPage: number; pageCount: number }
        | { id: string; mode: "percent"; percent: number },
    ) => setBookProgress({ data }),
    onSuccess: () => invalidateShelves(client),
  });
}

/**
 * One-time Open Library lookup for a book with no page count. A hit is saved
 * server-side, then shelves refetch so the progress form picks it up.
 */
export function useBookPageCountLookup(id: string, enabled: boolean) {
  const client = useQueryClient();
  return useQuery({
    queryKey: [...queryKeys.shelves.all, "page-count", id] as const,
    queryFn: async () => {
      const res = await fillBookPageCount({ data: { id } });
      if (res.pageCount) await invalidateShelves(client);
      return res;
    },
    enabled,
    staleTime: Infinity,
    retry: false,
  });
}
