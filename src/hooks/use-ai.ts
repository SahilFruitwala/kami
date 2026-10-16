import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { aiApi } from "@/lib/api/ai";
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

/** Ask the model which blocks of an article are clutter (nothing is saved). */
export function useTidyArticle(articleId: string) {
  return useMutation({
    mutationFn: () => aiApi.tidy(articleId),
    onError: (err) => toastError(err, "Could not tidy this copy."),
  });
}
