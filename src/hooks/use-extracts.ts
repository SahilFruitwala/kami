import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { extractsApi, type ExtractSourceInput } from "@/lib/api/extracts";
import { queryKeys } from "@/lib/query-client.ts";
import { errorMessage } from "@/lib/errors";

export function useExtractsOverview() {
  return useQuery({
    queryKey: queryKeys.extracts.overview(),
    queryFn: () => extractsApi.overview(),
  });
}

export function useExtractResults(sourceId: string | null) {
  return useQuery({
    queryKey: queryKeys.extracts.results(sourceId ?? ""),
    queryFn: () => extractsApi.results(sourceId!),
    enabled: sourceId !== null,
  });
}

export function useExtractActions() {
  const client = useQueryClient();
  const invalidate = () => client.invalidateQueries({ queryKey: queryKeys.extracts.all });

  const create = useMutation({
    mutationFn: (input: ExtractSourceInput) => extractsApi.create(input),
    onSuccess: (source) => {
      toast.success(`Saved “${source.name}”`, { description: "Press Run to fetch it." });
      void invalidate();
    },
    onError: (err) => toast.error(errorMessage(err, "Could not save that extract.")),
  });

  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<ExtractSourceInput> }) =>
      extractsApi.update(id, input),
    onSuccess: () => void invalidate(),
    onError: (err) => toast.error(errorMessage(err, "Could not update that extract.")),
  });

  const remove = useMutation({
    mutationFn: (id: string) => extractsApi.remove(id),
    onSuccess: () => {
      toast.success("Extract deleted");
      void invalidate();
    },
    onError: (err) => toast.error(errorMessage(err, "Could not delete that extract.")),
  });

  const run = useMutation({
    mutationFn: ({ id, fresh }: { id: string; fresh?: boolean }) => extractsApi.run(id, { fresh }),
    onSuccess: () => {
      toast.success("Result ready — review it below");
      void invalidate();
    },
    onError: (err) => {
      toast.error(errorMessage(err, "Firecrawl run failed."));
      void invalidate();
    },
  });

  const accept = useMutation({
    mutationFn: (resultId: string) => extractsApi.accept(resultId),
    onSuccess: () => {
      toast.success("Saved to history");
      void invalidate();
    },
    onError: (err) => toast.error(errorMessage(err, "Could not accept that result.")),
  });

  const discard = useMutation({
    mutationFn: (resultId: string) => extractsApi.discard(resultId),
    onSuccess: () => void invalidate(),
    onError: (err) => toast.error(errorMessage(err, "Could not discard that result.")),
  });

  return { create, update, remove, run, accept, discard };
}
