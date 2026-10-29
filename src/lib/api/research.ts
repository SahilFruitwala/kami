import type { ResearchCreditEntry } from "../research/credits.ts";
import type { RunEstimate } from "../research/estimate.ts";
import type {
  Depth,
  DiscoverInput,
  IdeaStatus,
  IdeaScore,
  PlanQuery,
  RunProgress,
  SearchHit,
} from "../research/kinds.ts";
import type { ReportBody } from "../research/report.ts";
import { http, seg } from "./client";

export type { RunEstimate };

/** Shapes of the Research API: the product routes (tickets 10–13) and the debug page (ticket 09). */

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
    kind: string;
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

// ---------- Product API (tickets 10–13) ----------

export type ResearchStatus = { enabled: boolean; balance: number; writerModel: boolean };

export type ResearchCredits = { enabled: boolean; balance: number; entries: ResearchCreditEntry[] };

export type ResearchTopic = { id: string; name: string; createdAt: number; updatedAt: number };

export type ResearchTopicSummary = ResearchTopic & { liveIdeas: number; lastRunAt: number | null };

export type RunSummary = {
  id: string;
  topicId: string;
  kind: string;
  depth: Depth;
  state: string;
  stopReason: string | null;
  seed: string;
  /** A run from a pasted link, or from a plan. */
  addedBy: "plan" | "link";
  ideasNew: number;
  ideasTouched: number;
  quotes: number;
  chargedCredits: number | null;
  createdAt: number;
  /** False for a plan discarded before it ran. */
  started: boolean;
  finishedAt: number | null;
};

export type ResearchTopicDetail = { topic: ResearchTopic; runs: RunSummary[] };

export type DraftRunInput = {
  /** Find ideas (default) or Ask a question. */
  kind?: "discover" | "question" | "explore";
  /** An existing topic, or a new one named after the seed. */
  topicId?: string;
  seed: string;
  depth: Depth;
  audience?: "b2b" | "b2c" | "any";
  includeSites?: string[];
  excludeSites?: string[];
  sinceMonths?: number;
};

export type IdeaCard = {
  id: string;
  topicId: string;
  title: string;
  summary: string;
  status: IdeaStatus;
  score: IdeaScore | null;
  evidenceCount: number;
  /** Quotes the topic's latest run added, and whether that run created it. */
  addedLastRun: number;
  isNew: boolean;
  renamed: boolean;
};

export type RunView = {
  run: {
    id: string;
    topicId: string;
    topicName: string;
    kind: string;
    state: string;
    stopReason: string | null;
    step: string | null;
    depth: Depth;
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
  /** For a run awaiting its plan: the estimate per depth, and the caller's balance. */
  estimates: Record<Depth, RunEstimate>;
  balance: number;
  /** Ideas this run created or added to so far, best first. */
  ideas: IdeaCard[];
  /** The report a Validate or question run wrote, once it has. */
  reportId: string | null;
};

export type PlayerView = {
  id: string;
  name: string;
  url: string | null;
  category: string | null;
  oneLiner: string | null;
  audience: "b2b" | "b2c" | "both" | null;
  plans: Array<{ name: string; price: string }>;
  freePlan: boolean | null;
  /** Quotes that name it, and how many of those are negative. */
  mentions: number;
  complaints: number;
  /** Looked up on its own pages (a player can be filled with nothing found). */
  filled: boolean;
};

export type ReportSummary = {
  id: string;
  topicId: string;
  runId: string;
  kind: "validate" | "question";
  ideaId: string | null;
  question: string;
  /** Claims written by the model (notes written by code don't count). */
  claims: number;
  unsupported: number;
  /** Written without a full draft: no evidence, or the run's budget ran out. */
  partial: boolean;
  createdAt: number;
};

export type ReportView = {
  report: ReportSummary;
  body: ReportBody;
  /** The evidence the report cites, by id. */
  evidence: Record<string, EvidenceView>;
};

export type EvidenceView = {
  id: string;
  quote: string;
  kind: string;
  match: "exact" | "close";
  sentiment: number;
  strong: boolean;
  pays: boolean;
  names: string[];
  postedAt: number | null;
  source: { id: string; url: string; title: string; site: string };
};

export type IdeaDetail = { idea: IdeaCard; evidence: EvidenceView[] };

export type IdeaPatch = {
  title?: string;
  summary?: string;
  status?: "open" | "starred" | "dismissed";
};

export type TopicSource = {
  id: string;
  url: string;
  title: string;
  site: string;
  kind: string;
  addedBy: string;
  fetchedAt: number;
  evidenceCount: number;
};

const topicPath = (id: string) => `/api/research/topics/${seg(id)}`;
const runPath = (id: string) => `/api/research/runs/${seg(id)}`;
const ideaPath = (id: string) => `/api/research/ideas/${seg(id)}`;

export const researchApi = {
  status: () => http.get<ResearchStatus>("/api/research/status"),
  credits: () => http.get<ResearchCredits>("/api/research/credits"),

  topics: () => http.get<ResearchTopicSummary[]>("/api/research/topics"),
  createTopic: (name: string) => http.post<ResearchTopic>("/api/research/topics", { name }),
  topic: (id: string) => http.get<ResearchTopicDetail>(topicPath(id)),
  renameTopic: (id: string, name: string) => http.patch<ResearchTopic>(topicPath(id), { name }),
  deleteTopic: (id: string) => http.delete<void>(topicPath(id)),

  ideas: (topicId: string, status?: string) =>
    http.get<IdeaCard[]>(`${topicPath(topicId)}/ideas`, { status }),
  idea: (id: string) => http.get<IdeaDetail>(ideaPath(id)),
  updateIdea: (id: string, patch: IdeaPatch) => http.patch<IdeaCard>(ideaPath(id), patch),
  mergeIdeas: (intoId: string, fromIds: string[]) =>
    http.post<IdeaCard>("/api/research/ideas/merge", { intoId, fromIds }),
  players: (topicId: string) => http.get<PlayerView[]>(`${topicPath(topicId)}/players`),
  reports: (topicId: string) => http.get<ReportSummary[]>(`${topicPath(topicId)}/reports`),
  report: (id: string) => http.get<ReportView>(`/api/research/reports/${seg(id)}`),
  validateIdea: (ideaId: string, depth: Depth) =>
    http.post<RunView>(`${ideaPath(ideaId)}/validate`, { depth }),
  sources: (topicId: string) => http.get<TopicSource[]>(`${topicPath(topicId)}/sources`),
  pasteLink: (topicId: string, url: string) =>
    http.post<{ runId: string }>(`${topicPath(topicId)}/links`, { url }),

  draft: (input: DraftRunInput) => http.post<RunView>("/api/research/runs", input),
  run: (id: string) => http.get<RunView>(runPath(id)),
  start: (id: string, body: { depth: Depth; plan: PlanQuery[] }) =>
    http.post<{ runId: string }>(`${runPath(id)}/start`, body),
  stop: (id: string) => http.post<{ runId: string }>(`${runPath(id)}/stop`),
};
