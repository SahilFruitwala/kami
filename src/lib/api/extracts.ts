import type { z } from "zod";
import type { createSourceInput, runInput, updateSourceInput } from "./schemas/extracts";
import { http, seg } from "./client";

export type ExtractResultStatus = "pending" | "accepted";

export type ExtractResult = {
  id: string;
  sourceId: string;
  status: ExtractResultStatus;
  /** Firecrawl's answer as stored. */
  markdown: string;
  /** `markdown` rendered and sanitized server-side — safe for innerHTML. */
  html: string;
  /** What was asked when this result was made (survives source edits). */
  url: string;
  question: string;
  createdAt: number;
  acceptedAt: number | null;
};

export type ExtractSource = {
  id: string;
  name: string;
  url: string;
  question: string;
  lastRunAt: number | null;
  /** Set when the last run failed; cleared on the next good run. */
  lastError: string | null;
  createdAt: number;
  /** The latest run, waiting for Accept / Discard. */
  pending: ExtractResult | null;
  acceptedCount: number;
};

export type ExtractsOverview = {
  /** Server has FIRECRAWL_API_KEY configured. */
  enabled: boolean;
  sources: ExtractSource[];
};

export type ExtractSourceInput = z.input<typeof createSourceInput>;
export type ExtractSourcePatch = z.input<typeof updateSourceInput>;

const source = (id: string) => `/api/extracts/${seg(id)}`;
const result = (id: string) => `/api/extracts/results/${seg(id)}`;

export const extractsApi = {
  overview: () => http.get<ExtractsOverview>("/api/extracts"),

  create: (input: ExtractSourceInput) => http.post<ExtractSource>("/api/extracts", input),

  update: (id: string, input: ExtractSourcePatch) => http.patch<ExtractSource>(source(id), input),

  remove: (id: string) => http.delete<void>(source(id)),

  /** Ask Firecrawl now; the answer comes back as the source's pending result. */
  run: (id: string, opts: z.input<typeof runInput> = {}) =>
    http.post<ExtractResult>(`${source(id)}/run`, opts),

  /** Accepted results for a source, newest first. */
  results: (id: string) => http.get<ExtractResult[]>(`${source(id)}/results`),

  accept: (id: string) => http.post<ExtractResult>(`${result(id)}/accept`),

  /** Discard a pending result, or delete an accepted one. */
  discard: (id: string) => http.delete<void>(result(id)),
};
