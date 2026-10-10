import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { aiApi } from "@/lib/api/ai";
import { queryKeys } from "@/lib/query-client.ts";

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
    semanticSearch: query.data?.semanticSearch ?? false,
  };
}

/** One indexing run per page load is enough; later saves are picked up next visit. */
let indexingStarted = false;
const MAX_INDEX_ROUNDS = 25;

/**
 * Keep the semantic index current in the background: embed new or changed
 * articles and highlights in small batches while the library is open.
 */
export function useLibraryIndexer() {
  const { semanticSearch } = useAiStatus();
  useEffect(() => {
    if (!semanticSearch || indexingStarted) return;
    indexingStarted = true;
    // Not tied to the component: a run finishes even if the user navigates away.
    void (async () => {
      for (let round = 0; round < MAX_INDEX_ROUNDS; round++) {
        try {
          const progress = await aiApi.index();
          if (!progress.enabled || progress.indexed === 0 || progress.remaining === 0) return;
        } catch {
          // Rate limited or provider trouble: try again on the next visit.
          indexingStarted = false;
          return;
        }
      }
    })();
  }, [semanticSearch]);
}
