import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { aiApi } from "@/lib/api/ai";
import { libraryApi } from "@/lib/api/library";
import { toastError } from "@/lib/errors";
import type { LibraryItem } from "@/lib/library-item";
import { queryKeys } from "@/lib/query-client.ts";
import { useLibraryStore } from "@/lib/store.ts";
import { useReaderPrefs } from "@/lib/reader-prefs.ts";

/** What the server's AI can do; buttons hide while unknown or when off. */
export function useAiStatus() {
  const query = useQuery({
    queryKey: queryKeys.ai.status(),
    queryFn: () => aiApi.status(),
    staleTime: 30 * 60_000,
    retry: false,
  });
  return {
    enabled: query.data?.enabled ?? false,
    narration: query.data?.narration ?? false,
  };
}

const MAX_ORGANIZE_ROUNDS = 200;
let organizing: Promise<number> | null = null;

/**
 * File untagged, unfiled articles in small server batches, mirroring each
 * result into the store. One run at a time; returns how many were filed.
 * `onProgress` gets the count left after each batch.
 */
export function organizeLibrary(onProgress?: (remaining: number, filed: number) => void) {
  if (organizing) return organizing;
  organizing = (async () => {
    const tried: string[] = [];
    let filed = 0;
    try {
      for (let round = 0; round < MAX_ORGANIZE_ROUNDS; round++) {
        const progress = await aiApi.organize(tried);
        if (!progress.enabled) break;
        useLibraryStore.getState().applyOrganized(progress.done);
        filed += progress.done.length;
        tried.push(...progress.attempted);
        onProgress?.(progress.remaining, filed);
        if (progress.remaining === 0) break;
      }
    } finally {
      organizing = null;
    }
    return filed;
  })();
  return organizing;
}

/** Quietly file whatever is untouched: once per page load, and after in-app saves. */
let autoOrganizeStarted = false;
export function useAutoOrganize() {
  const { enabled } = useAiStatus();
  const auto = useReaderPrefs((s) => s.autoOrganize);
  useEffect(() => {
    if (!enabled || !auto || autoOrganizeStarted) return;
    autoOrganizeStarted = true;
    void organizeLibrary().catch(() => {
      // Rate limited or provider trouble: try again on the next visit.
      autoOrganizeStarted = false;
    });
  }, [enabled, auto]);
}

/** For save flows: file the new article if auto-organise is on and AI is set up. */
export function useOrganizeAfterSave() {
  const { enabled } = useAiStatus();
  const auto = useReaderPrefs((s) => s.autoOrganize);
  return () => {
    if (enabled && auto) void organizeLibrary().catch(() => {});
  };
}

/** The cached AI summary of an article, plus a mutation that (re)generates it. */
export function useArticleSummary(articleId: string) {
  const client = useQueryClient();
  const key = queryKeys.ai.summary(articleId);
  const query = useQuery({
    queryKey: key,
    queryFn: () => aiApi.summary(articleId),
    staleTime: Infinity,
    retry: false,
  });
  const summarize = useMutation({
    mutationFn: () => aiApi.summarize(articleId),
    onSuccess: (summary) => client.setQueryData(key, summary),
    onError: (err) => toastError(err, "Could not summarize this article."),
  });
  return { query, summarize };
}

/** Drop a cached summary (the article body changed). */
export function useInvalidateArticleSummary() {
  const client = useQueryClient();
  return (articleId: string) =>
    void client.invalidateQueries({ queryKey: queryKeys.ai.summary(articleId) });
}

/** Tag an article with up to three categories, mirroring the result into the store. */
export function useAutoTag(item: LibraryItem) {
  const upsertItem = useLibraryStore((s) => s.upsertItem);
  return useMutation({
    mutationFn: () => aiApi.autoTag(item.id),
    onSuccess: ({ tags }) => {
      const added = tags.filter((t) => !item.tags.includes(t));
      upsertItem({ ...item, tags });
      toast.success(
        added.length
          ? `Tagged: ${added.join(", ")}`
          : "Already tagged with the best-fit categories",
      );
    },
    onError: (err) => toastError(err, "Could not auto-tag this article."),
  });
}

/** Clean up an article's saved copy (the server saves it and keeps the original). */
export function useTidyArticle(articleId: string) {
  return useMutation({
    mutationFn: () => aiApi.tidy(articleId),
    onError: (err) => toastError(err, "Could not tidy this copy."),
  });
}

/** A save younger than this already queued a background Tidy on the server. */
const FRESH_SAVE_MS = 2 * 60_000;
/** Articles this tab already asked to tidy (survives StrictMode re-runs). */
const tidyRequested = new Set<string>();

/**
 * Tidy a `pending` article the reader opens: bulk imports and older saves are
 * tidied here, on first open. A fresh single save was queued for a background
 * Tidy when it was saved, so the reader just picks up that result shortly.
 */
export function useAutoTidy(item: LibraryItem, enabled: boolean) {
  const client = useQueryClient();
  const upsertItem = useLibraryStore((s) => s.upsertItem);
  const pending = enabled && item.tidyState === "pending";
  const { id, savedAt } = item;
  useEffect(() => {
    if (!pending || tidyRequested.has(id)) return;
    tidyRequested.add(id);
    let cancelled = false;
    const apply = (next: LibraryItem | null) => {
      if (cancelled || !next?.contentHtml || next.tidyState === "pending") return;
      // Already saved on the server; mirror it locally without re-syncing.
      upsertItem(next, { sync: false });
      void client.invalidateQueries({ queryKey: queryKeys.ai.summary(next.id) });
    };
    if (Date.now() - savedAt < FRESH_SAVE_MS) {
      const timer = setTimeout(() => void libraryApi.items.get(id).then(apply), 15_000);
      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    }
    // A failure is recorded on the article; refetch so "Retry clean-up" shows.
    aiApi.tidy(id).then(
      (result) => apply(result.item),
      () => void libraryApi.items.get(id).then(apply),
    );
    return () => {
      cancelled = true;
    };
  }, [pending, id, savedAt, client, upsertItem]);
}
