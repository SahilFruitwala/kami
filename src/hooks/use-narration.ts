import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAiStatus } from "@/hooks/use-ai.ts";
import { narrationApi } from "@/lib/api/narration";
import type { Refusal } from "@/lib/narration-engine";
import type { LibraryItem } from "@/lib/library-item";
import { toastError } from "@/lib/errors";
import { queryKeys } from "@/lib/query-client.ts";

/** Narration states in which audio is still being made (poll while in one). */
export const ACTIVE_NARRATION = new Set(["queued", "tidying", "narrating", "joining"]);

/** Server state for one article's narration, polled while it is being made. */
export function useNarration(item: LibraryItem) {
  const { narration: enabled } = useAiStatus();
  const client = useQueryClient();
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [playerOpen, setPlayerOpen] = useState(true);
  const key = queryKeys.narration.article(item.id);

  const query = useQuery({
    queryKey: key,
    queryFn: () => narrationApi.get(item.id),
    enabled,
    refetchInterval: (q) =>
      q.state.data && ACTIVE_NARRATION.has(q.state.data.state) ? 3_000 : false,
  });

  const start = useMutation({
    mutationFn: () => narrationApi.start(item.id),
    onSuccess: (result) => {
      void client.invalidateQueries({ queryKey: queryKeys.narration.all });
      if (result.ok) {
        client.setQueryData(key, result.narration);
        setPlayerOpen(true);
      } else {
        setRefusal(result.refusal);
      }
    },
    onError: (err) => toastError(err, "Could not create audio."),
  });

  const remove = useMutation({
    mutationFn: () => narrationApi.remove(item.id),
    onSuccess: () => {
      client.setQueryData(key, null);
      void client.invalidateQueries({ queryKey: queryKeys.narration.all });
      toast.success("Audio deleted");
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Could not delete the audio."),
  });

  return {
    enabled,
    view: enabled ? (query.data ?? null) : null,
    start,
    remove,
    refusal,
    clearRefusal: () => setRefusal(null),
    playerOpen,
    setPlayerOpen,
  };
}

export type NarrationHandle = ReturnType<typeof useNarration>;

/** The caller's own narration allowance (never the Deepgram balance). */
export function useAllowance() {
  return useQuery({
    queryKey: queryKeys.narration.allowance(),
    queryFn: () => narrationApi.allowance(),
    staleTime: 30_000,
  });
}
