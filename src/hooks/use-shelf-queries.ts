import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { lookupApi } from "@/lib/api/lookup";
import {
  shelvesApi,
  type BookEdit,
  type BookProgress,
  type NewShelfItem,
  type ShelfType,
} from "@/lib/api/shelves";
import type { ItemStatus } from "@/lib/schema";
import type { ShelfTab } from "@/lib/shelves";
import { announceLinks } from "@/hooks/use-reading-links.ts";
import { invalidateShelves, queryKeys } from "@/lib/query-client";
import { toastError } from "@/lib/errors";
import type { BookCsvSource, GoodreadsBook } from "@/lib/goodreads";

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

const linkPreviewQuery = (href: string) => ({
  queryKey: queryKeys.lookup.link(href),
  queryFn: () => lookupApi.link(href),
  staleTime: LOOKUP_STALE_TIME,
  gcTime: LOOKUP_GC_TIME,
});

export function useLinkPreview(url: string, enabled: boolean) {
  const href = url.trim();
  return useQuery({ ...linkPreviewQuery(href), enabled: enabled && href.length >= 4 });
}

/** Imperative link preview (on a button press), sharing `useLinkPreview`'s cache. */
export function useFetchLinkPreview() {
  const client = useQueryClient();
  return (url: string) => client.fetchQuery(linkPreviewQuery(url.trim()));
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
    onSuccess: (res, vars) => {
      // Marking a book read can complete a milestone it is linked to.
      if (vars.type === "book") announceLinks(client, vars.id, res.links);
      return invalidateShelves(client);
    },
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

const seasonEpisodesQuery = (itemId: string, season: number) => ({
  queryKey: queryKeys.shelves.episodes(itemId, season),
  queryFn: () => shelvesApi.tv.episodes(itemId, season),
  staleTime: 60 * 60_000,
});

export function useSeasonEpisodes(itemId: string | null, season: number | null) {
  return useQuery({
    ...seasonEpisodesQuery(itemId ?? "", season ?? -1),
    enabled: Boolean(itemId) && season != null,
  });
}

/** Imperative season episode list, sharing `useSeasonEpisodes`' cache. */
export function useFetchSeasonEpisodes() {
  const client = useQueryClient();
  return (itemId: string, season: number) => client.fetchQuery(seasonEpisodesQuery(itemId, season));
}

export function useToggleEpisode(itemId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (data: { season: number; number: number }) =>
      shelvesApi.tv.toggleEpisode(itemId, data.season, data.number),
    onError: (e) => toastError(e, "Couldn't update episodes."),
    onSuccess: () => {
      void invalidateShelves(client);
      void client.invalidateQueries({ queryKey: queryKeys.shelves.seasons(itemId) });
      void client.invalidateQueries({
        queryKey: queryKeys.shelves.episodesAll(itemId),
      });
    },
  });
}

export function useSetSeasonWatched(itemId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (data: { season: number; numbers: number[]; watched: boolean }) =>
      shelvesApi.tv.setSeasonWatched(itemId, data.season, data.numbers, data.watched),
    onError: (e) => toastError(e, "Couldn't update episodes."),
    onSuccess: () => {
      void invalidateShelves(client);
      void client.invalidateQueries({ queryKey: queryKeys.shelves.seasons(itemId) });
      void client.invalidateQueries({
        queryKey: queryKeys.shelves.episodesAll(itemId),
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
        queryKey: queryKeys.shelves.episodesAll(vars.itemId),
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
 * One-time Open Library lookup for a book with no page count. A hit is saved
 * server-side, then shelves refetch so the progress form picks it up.
 */
export function useBookPageCountLookup(id: string, enabled: boolean) {
  const client = useQueryClient();
  return useQuery({
    queryKey: queryKeys.shelves.pageCount(id),
    queryFn: async () => {
      const res = await shelvesApi.books.fillPageCount(id);
      if (res.pageCount) await invalidateShelves(client);
      return res;
    },
    enabled,
    staleTime: Infinity,
    retry: false,
  });
}

/** Edit a book's title, author, year, synopsis and page count. */
export function useUpdateBook() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (data: { id: string; fields: BookEdit }) =>
      shelvesApi.books.update(data.id, data.fields),
    onSuccess: () => invalidateShelves(client),
  });
}

/**
 * Lazy synopsis for a book that has none: Open Library is asked once, the
 * answer is saved server-side, then shelves refetch to show it.
 */
export function useBookOverviewLookup(id: string, enabled: boolean) {
  const client = useQueryClient();
  return useQuery({
    queryKey: ["book-overview", id],
    queryFn: async () => {
      const res = await shelvesApi.books.fillOverview(id);
      if (res.overview) await invalidateShelves(client);
      return res;
    },
    enabled,
    staleTime: Infinity,
    retry: false,
  });
}

/** Where a title streams / rents, per country (TMDB via the server). */
export function useWatchProviders(kind: "movie" | "tv", tmdbId: string) {
  return useQuery({
    queryKey: queryKeys.lookup.watchProviders(kind, tmdbId),
    queryFn: () => lookupApi.watchProviders(tmdbId, kind),
    staleTime: 12 * 60 * 60_000,
  });
}

/** Where-to-watch for a whole shelf page, for filtering by service. */
export function useWatchProvidersBatch(kind: "movie" | "tv", tmdbIds: string[], enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.lookup.watchProvidersBatch(kind, tmdbIds),
    queryFn: () => lookupApi.watchProvidersBatch(tmdbIds, kind),
    enabled: enabled && tmdbIds.length > 0,
    staleTime: 12 * 60 * 60_000,
    placeholderData: keepPreviousData,
  });
}

/** Bulk-add books parsed from a Goodreads / StoryGraph export. */
export function useImportBooks() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { source: BookCsvSource; books: GoodreadsBook[] }) =>
      shelvesApi.books.importBooks(args.source, args.books),
    onSuccess: () => void invalidateShelves(client),
  });
}
