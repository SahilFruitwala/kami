import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { lookupApi } from "@/lib/api/lookup";
import {
  shelvesApi,
  type BookProgress,
  type NewShelfItem,
  type ShelfType,
} from "@/lib/api/shelves";
import type { ItemStatus } from "@/lib/schema";
import type { ShelfTab } from "@/lib/shelves";
import { invalidateShelves, queryKeys } from "@/lib/query-client";

export function useShelfCounts() {
  return useQuery({
    queryKey: queryKeys.shelves.counts(),
    queryFn: () => shelvesApi.counts(),
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
      shelvesApi.list(args.type, { status: args.status, query: args.query, limit, offset: 0 }),
    placeholderData: (prev) => prev,
  });
}

export function useShelfDetail(type: ShelfTab, id: string | null) {
  return useQuery({
    queryKey: queryKeys.shelves.detail(type, id ?? ""),
    queryFn: () => shelvesApi.get(type, id!),
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
    queryFn: () => lookupApi.tmdb(q, kind),
    enabled: enabled && q.length >= 2,
    staleTime: LOOKUP_STALE_TIME,
    gcTime: LOOKUP_GC_TIME,
  });
}

export function useBookSearch(query: string, enabled: boolean) {
  const q = query.trim();
  return useQuery({
    queryKey: queryKeys.lookup.books(q),
    queryFn: () => lookupApi.books(q),
    enabled: enabled && q.length >= 2,
    staleTime: LOOKUP_STALE_TIME,
    gcTime: LOOKUP_GC_TIME,
  });
}

export function useLinkPreview(url: string, enabled: boolean) {
  const href = url.trim();
  return useQuery({
    queryKey: queryKeys.lookup.link(href),
    queryFn: () => lookupApi.link(href),
    enabled: enabled && href.length >= 4,
    staleTime: LOOKUP_STALE_TIME,
    gcTime: LOOKUP_GC_TIME,
  });
}

export function useAddShelfItem() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ type, ...input }: NewShelfItem & { type: ShelfType }) =>
      shelvesApi.add(type, input),
    onSuccess: () => invalidateShelves(client),
  });
}

export function useFindShelfDuplicates() {
  return useMutation({
    mutationFn: (data: { type: ShelfTab; title: string; tmdbId?: string }) =>
      shelvesApi.duplicates(data.type, data.title, data.tmdbId),
  });
}

export function useSetShelfItemStatus() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (data: { type: ShelfTab; id: string; status: ItemStatus }) =>
      shelvesApi.setStatus(data.type, data.id, data.status),
    onSuccess: () => invalidateShelves(client),
  });
}

export function useDeleteShelfItem() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (data: { type: ShelfTab; id: string }) => shelvesApi.remove(data.type, data.id),
    onSuccess: () => invalidateShelves(client),
  });
}

export function useShowSeasons(itemId: string | null) {
  return useQuery({
    queryKey: queryKeys.shelves.seasons(itemId ?? ""),
    queryFn: () => shelvesApi.tv.seasons(itemId!),
    enabled: Boolean(itemId),
    staleTime: 60 * 60_000,
  });
}

export function useSeasonEpisodes(itemId: string | null, season: number | null) {
  return useQuery({
    queryKey: queryKeys.shelves.episodes(itemId ?? "", season ?? -1),
    queryFn: () => shelvesApi.tv.episodes(itemId!, season!),
    enabled: Boolean(itemId) && season != null,
    staleTime: 60 * 60_000,
  });
}

export function useToggleEpisode(itemId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (data: { season: number; number: number }) =>
      shelvesApi.tv.toggleEpisode(itemId, data.season, data.number),
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
      shelvesApi.tv.setSeasonWatched(itemId, data.season, data.numbers, data.watched),
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
    mutationFn: (data: { itemId: string; watched: boolean }) =>
      shelvesApi.tv.setWatched(data.itemId, data.watched),
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
    mutationFn: ({ id, ...progress }: BookProgress & { id: string }) =>
      shelvesApi.books.setProgress(id, progress),
    onSuccess: () => invalidateShelves(client),
  });
}

/**
 * One-time Open Library lookup for a book with no page count or an
 * import-guessed cover. A hit is saved server-side, then shelves refetch so
 * the progress form and cover pick it up.
 */
export function useBookPageCountLookup(id: string, enabled: boolean) {
  const client = useQueryClient();
  return useQuery({
    queryKey: [...queryKeys.shelves.all, "page-count", id] as const,
    queryFn: async () => {
      const res = await shelvesApi.books.fillPageCount(id);
      await invalidateShelves(client);
      return res;
    },
    enabled,
    staleTime: Infinity,
    retry: false,
  });
}
