import { useQuery, useQueryClient } from "@tanstack/react-query";
import { researchApi } from "@/lib/api/research.ts";
import { queryKeys } from "@/lib/query-client.ts";

/** Run states in which a run is still working (poll while in one). */
export const ACTIVE_RUN = new Set(["drafting", "queued", "running"]);

/** Whether Research is on for this server, and the caller's balance. */
export function useResearchStatus() {
  return useQuery({
    queryKey: queryKeys.research.status(),
    queryFn: () => researchApi.status(),
    staleTime: 60_000,
  });
}

export function useResearchCredits() {
  return useQuery({ queryKey: queryKeys.research.credits(), queryFn: () => researchApi.credits() });
}

export function useResearchTopics() {
  return useQuery({ queryKey: queryKeys.research.topics(), queryFn: () => researchApi.topics() });
}

export function useResearchTopic(id: string) {
  return useQuery({ queryKey: queryKeys.research.topic(id), queryFn: () => researchApi.topic(id) });
}

/** A run, polled every 2 s while it's working. */
export function useResearchRun(id: string) {
  return useQuery({
    queryKey: queryKeys.research.run(id),
    queryFn: () => researchApi.run(id),
    refetchInterval: (q) =>
      q.state.data && ACTIVE_RUN.has(q.state.data.run.state) ? 2_000 : false,
  });
}

export function useTopicIdeas(topicId: string, status: string) {
  return useQuery({
    queryKey: queryKeys.research.ideas(topicId, status),
    queryFn: () => researchApi.ideas(topicId, status),
  });
}

export function useIdea(id: string | null) {
  return useQuery({
    queryKey: queryKeys.research.idea(id ?? ""),
    queryFn: () => researchApi.idea(id as string),
    enabled: Boolean(id),
  });
}

export function useTopicSources(topicId: string) {
  return useQuery({
    queryKey: queryKeys.research.sources(topicId),
    queryFn: () => researchApi.sources(topicId),
  });
}

export function useTopicPlayers(topicId: string) {
  return useQuery({
    queryKey: queryKeys.research.players(topicId),
    queryFn: () => researchApi.players(topicId),
  });
}

export function useTopicReports(topicId: string) {
  return useQuery({
    queryKey: queryKeys.research.reports(topicId),
    queryFn: () => researchApi.reports(topicId),
  });
}

export function useReport(id: string) {
  return useQuery({
    queryKey: queryKeys.research.report(id),
    queryFn: () => researchApi.report(id),
  });
}

/** Refetch everything Research shows (after a change: start, stop, star, merge, rename…). */
export function useResearchRefresh() {
  const client = useQueryClient();
  return () => void client.invalidateQueries({ queryKey: queryKeys.research.all });
}
