import { useQuery } from "@tanstack/react-query";
import { narrationApi } from "@/lib/api/narration";
import { queryKeys } from "@/lib/query-client.ts";

/** The caller's own narration allowance (never the Deepgram balance). */
export function useAllowance() {
  return useQuery({
    queryKey: queryKeys.narration.allowance(),
    queryFn: () => narrationApi.allowance(),
    staleTime: 30_000,
  });
}
