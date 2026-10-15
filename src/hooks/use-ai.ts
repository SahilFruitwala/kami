import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { aiApi } from "@/lib/api/ai";
import { queryKeys } from "@/lib/query-client.ts";
import { useLibraryStore } from "@/lib/store.ts";

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
  const auto = useLibraryStore((s) => s.autoOrganize);
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
  const auto = useLibraryStore((s) => s.autoOrganize);
  return () => {
    if (enabled && auto) void organizeLibrary().catch(() => {});
  };
}
