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
