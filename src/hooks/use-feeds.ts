import { useEffect, useRef } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { toast } from "sonner";
import {
  feedsApi,
  type FeedEntry,
  type FeedEntryPage,
  type FeedEntryView,
  type FeedsOverview,
} from "@/lib/api/feeds";
import { libraryApi } from "@/lib/api/library";
import { persistArticleItem } from "@/lib/library-remote.ts";
import { queryKeys } from "@/lib/query-client.ts";
import { articleToItem, useLibraryStore, type LibraryItem } from "@/lib/store.ts";

export const FEED_PAGE_SIZE = 30;

export function useFeedsOverview() {
  return useQuery({
    queryKey: queryKeys.feeds.overview(),
    queryFn: () => feedsApi.overview(),
  });
}

export function useFeedEntries(view: FeedEntryView, feedId: string | null) {
  return useInfiniteQuery({
    queryKey: queryKeys.feeds.entries(view, feedId),
    queryFn: ({ pageParam }) =>
      feedsApi.entries({
        view,
        feedId: feedId ?? undefined,
        cursor: pageParam,
        limit: FEED_PAGE_SIZE,
      }),
    initialPageParam: null as FeedEntryPage["nextCursor"],
    getNextPageParam: (last) => last.nextCursor,
    placeholderData: (prev) => prev,
  });
}

function useInvalidateFeeds() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: queryKeys.feeds.all });
}

/** Patch one entry in every cached entry list, and adjust unread counts. */
function useEntryPatcher() {
  const client = useQueryClient();
  return (ids: string[], state: FeedEntry["state"]) => {
    const target = new Set(ids);
    // entry id → feed id, for entries leaving "unread" (an entry can sit in
    // several cached lists; count it once).
    const leftUnread = new Map<string, string>();
    client.setQueriesData<InfiniteData<FeedEntryPage>>(
      { queryKey: queryKeys.feeds.entriesAll() },
      (data) =>
        data && {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            entries: page.entries.map((e) => {
              if (!target.has(e.id) || e.state === state) return e;
              if (e.state === null) leftUnread.set(e.id, e.feedId);
              return { ...e, state };
            }),
          })),
        },
    );
    const perFeed = new Map<string, number>();
    for (const feedId of leftUnread.values()) perFeed.set(feedId, (perFeed.get(feedId) ?? 0) + 1);
    client.setQueryData<FeedsOverview>(queryKeys.feeds.overview(), (data) =>
      data
        ? {
            ...data,
            feeds: data.feeds.map((f) => {
              const delta = perFeed.get(f.id) ?? 0;
              return delta ? { ...f, unread: Math.max(0, f.unread - delta) } : f;
            }),
          }
        : data,
    );
  };
}

/**
 * Poll this user's due feeds once when the page opens (the server bounds it
 * and skips anything polled recently), then refetch if anything arrived.
 */
export function useFeedsAutoRefresh(enabled: boolean) {
  const invalidate = useInvalidateFeeds();
  const ran = useRef(false);
  useEffect(() => {
    if (!enabled || ran.current) return;
    ran.current = true;
    void feedsApi
      .refresh(false)
      .then((r) => {
        if (r.newEntries > 0 || r.failed > 0) void invalidate();
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
}

export function useFeedActions() {
  const invalidate = useInvalidateFeeds();
  const patch = useEntryPatcher();

  const add = useMutation({
    mutationFn: (url: string) => feedsApi.add(url),
    onSuccess: ({ feed, added }) => {
      toast.success(added ? `Following ${feed.title}` : `Already following ${feed.title}`);
      void invalidate();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not add that feed."),
  });

  const refresh = useMutation({
    mutationFn: () => feedsApi.refresh(true),
    onSuccess: (r) => {
      toast.success(
        r.newEntries > 0
          ? `${r.newEntries} new ${r.newEntries === 1 ? "entry" : "entries"}`
          : r.polled > 0
            ? "All caught up"
            : "Feeds were checked moments ago",
      );
      void invalidate();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Refresh failed."),
  });

  const remove = useMutation({
    mutationFn: (id: string) => feedsApi.remove(id),
    onSuccess: () => {
      toast.success("Unsubscribed");
      void invalidate();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not unsubscribe."),
  });

  const rename = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string | null }) => feedsApi.rename(id, title),
    onSuccess: () => void invalidate(),
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not rename."),
  });

  const markRead = useMutation({
    mutationFn: (ids: string[]) => feedsApi.markRead(ids),
    onMutate: (ids) => patch(ids, "read"),
    onError: () => {
      toast.error("Could not mark as read.");
      void invalidate();
    },
  });

  const markAllRead = useMutation({
    mutationFn: (feedId: string | null) => feedsApi.markAllRead(feedId ?? undefined),
    onSuccess: () => {
      toast.success("Marked all as read");
      void invalidate();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not mark as read."),
  });

  const inbox = useMutation({
    mutationFn: (rotate: boolean) => feedsApi.inbox(rotate),
    onSuccess: () => void invalidate(),
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not create address."),
  });

  const importOpml = useMutation({
    mutationFn: (opml: string) => feedsApi.importOpml(opml),
    onSuccess: (r) => {
      toast.success(
        `Imported ${r.added} ${r.added === 1 ? "feed" : "feeds"}${r.skipped ? ` · ${r.skipped} skipped` : ""}`,
        { description: "New feeds fill in over the next few minutes." },
      );
      void invalidate();
      // The poller picks imported feeds up; nudge it for this user now.
      void feedsApi
        .refresh(false)
        .then(() => invalidate())
        .catch(() => undefined);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Import failed."),
  });

  /**
   * Save an entry into the library (and optionally open it). If the work is
   * already in the library it is opened as-is, never re-saved over existing
   * highlights and notes.
   */
  const save = useMutation({
    mutationFn: async (entry: FeedEntry): Promise<LibraryItem> => {
      const result = await feedsApi.article(entry.id);
      if (!result.ok) throw new Error(result.error);
      if ("existingId" in result) {
        const store = useLibraryStore.getState();
        const local = store.library.find((i) => i.id === result.existingId);
        if (local) return local;
        const fetched = await libraryApi.items.get(result.existingId);
        if (!fetched) throw new Error("That work is no longer in your library.");
        store.upsertItem(fetched, { sync: false });
        return fetched;
      }
      return persistArticleItem(articleToItem(result.article));
    },
    onSuccess: (_item, entry) => patch([entry.id], "saved"),
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Could not save that entry."),
  });

  return { add, refresh, remove, rename, markRead, markAllRead, inbox, importOpml, save };
}
