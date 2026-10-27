import type {
  DiscoverInput,
  IdeaScore,
  PlanQuery,
  RunProgress,
  SearchHit,
} from "../research/kinds.ts";
import { http, seg } from "./client";

/** Shapes of the Research debug API (ticket 09); the product API arrives with tickets 10–12. */

type DepthNumbers = Record<"quick" | "deep", number>;

export type DebugOverview = {
  balance: number;
  limits: Record<
    "quick" | "deep",
    { maxQueries: number; resultsPerQuery: number; pagesToRead: number; maxCandidates: number }
  >;
  budgets: DepthNumbers;
  runs: Array<{
    id: string;
    topicId: string;
    seed: string;
    depth: "quick" | "deep";
    state: string;
    createdAt: number;
  }>;
};

export type DebugRun = {
  run: {
    id: string;
    topicId: string;
    state: string;
    stopReason: string | null;
    step: string | null;
    depth: "quick" | "deep";
    input: DiscoverInput;
    plan: PlanQuery[];
    progress: RunProgress;
    budgetCredits: number;
    firecrawlCredits: number;
    tokensIn: number;
    tokensOut: number;
    chargedCredits: number | null;
    error: string | null;
    createdAt: number;
    startedAt: number | null;
    finishedAt: number | null;
  };
  queries: Array<{ query: string; hits: SearchHit[] }>;
  sources: Array<{
    id: string;
    url: string;
    urlKey: string;
    site: string;
    kind: string;
    title: string;
    chars: number;
    preview: string;
    fetchedAt: number;
  }>;
  evidence: Array<{
    id: string;
    quote: string;
    kind: string;
    match: string;
    sentiment: number;
    strong: boolean;
    pays: boolean;
    names: string[];
    hasAuthor: boolean;
    postedAt: number | null;
    source: string;
    ideaId: string | null;
  }>;
  ideas: Array<{
    id: string;
    title: string;
    summary: string;
    status: string;
    score: IdeaScore | null;
    evidenceCount: number;
    addedLastRun: number;
    isNew: boolean;
  }>;
};

export type DebugDraftInput = {
  seed: string;
  depth: "quick" | "deep";
  topicId?: string;
  sinceMonths?: number;
  includeSites?: string[];
  excludeSites?: string[];
};

const run = (id: string) => `/api/research/debug/runs/${seg(id)}`;

export const researchDebugApi = {
  overview: () => http.get<DebugOverview>("/api/research/debug"),
  draft: (input: DebugDraftInput) =>
    http.post<{ runId: string }>("/api/research/debug/runs", input),
  run: (id: string) => http.get<DebugRun>(run(id)),
  start: (id: string, body: { depth: "quick" | "deep"; plan: PlanQuery[] }) =>
    http.post<{ runId: string }>(`${run(id)}/start`, body),
  stop: (id: string) => http.post<{ runId: string }>(`${run(id)}/stop`),
};
