import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAiStatus } from "@/hooks/use-ai.ts";
import { narrationApi } from "@/lib/api/narration";
import type { Refusal } from "@/lib/narration-engine";
import type { LibraryItem } from "@/lib/store.ts";

/** Narration states in which audio is still being made (poll while in one). */
export const ACTIVE_NARRATION = new Set(["queued", "tidying", "narrating", "joining"]);

const narrationKey = (articleId: string) => ["narration", "article", articleId] as const;

/** Server state for one article's narration, polled while it is being made. */
export function useNarration(item: LibraryItem) {
  const { narration: enabled } = useAiStatus();
  const client = useQueryClient();
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [playerOpen, setPlayerOpen] = useState(true);
  const key = narrationKey(item.id);

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
      void client.invalidateQueries({ queryKey: ["narration"] });
      if (result.ok) {
        client.setQueryData(key, result.narration);
        setPlayerOpen(true);
      } else {
        setRefusal(result.refusal);
      }
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not create audio."),
  });

  const remove = useMutation({
    mutationFn: () => narrationApi.remove(item.id),
    onSuccess: () => {
      client.setQueryData(key, null);
      void client.invalidateQueries({ queryKey: ["narration"] });
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
