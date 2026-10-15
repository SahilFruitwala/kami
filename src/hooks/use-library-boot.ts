import { useQuery, useQueryClient } from "@tanstack/react-query";
import { bootstrapLibraryFromServer, clearLibraryLocal } from "@/lib/library-remote";
import { queryKeys } from "@/lib/query-client";

/**
 * Boot the signed-in user's library into the store, once per user. React
 * Query dedupes concurrent callers (every page mounts its own gate) and keeps
 * the result, so remounts never re-run the boot and replace the store.
 * Pass `undefined` while the session is unknown or signed out.
 */
export function useLibraryBoot(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.library.boot(userId ?? ""),
    queryFn: async () => {
      await bootstrapLibraryFromServer(userId!);
      return true;
    },
    enabled: Boolean(userId),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

/** Sign-out: clear the local library and forget the boot so the next user re-boots. */
export function useClearLibrarySession() {
  const client = useQueryClient();
  return () => {
    clearLibraryLocal();
    client.removeQueries({ queryKey: queryKeys.library.all });
  };
}
