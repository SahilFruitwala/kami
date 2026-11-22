import type { z } from "zod";
import { http, seg } from "./client";
import type { contributionInput, linkInput, linkPatch, LinkMode } from "./schemas/reading-links";

export type { LinkMode };
export type LinkInput = z.input<typeof linkInput>;
export type LinkPatch = z.input<typeof linkPatch>;
export type ContributionInput = z.input<typeof contributionInput>;

export type ReadingLink = {
  id: string;
  sourceType: "book";
  sourceId: string;
  habitId: string;
  mode: LinkMode;
};

/** One thing a book update did (or could do) for a linked habit on one day. */
export type LinkEvent = {
  linkId: string;
  habitId: string;
  habitName: string;
  day: string;
  /** What this update added, so "Undo" and "Log it" can send it back. */
  delta: number;
  unit: "pages" | "percent";
  label: string;
};

export type LinkOutcome = {
  /** Applied already (auto links); offer Undo. */
  applied: LinkEvent[];
  /** Waiting on a yes (ask links). */
  suggestions: LinkEvent[];
};

export const readingLinksApi = {
  forBook: (bookId: string) =>
    http.get<ReadingLink[]>("/api/reading-links", { sourceType: "book", sourceId: bookId }),
  create: (input: LinkInput) => http.post<ReadingLink>("/api/reading-links", input),
  update: (id: string, patch: LinkPatch) =>
    http.patch<ReadingLink>(`/api/reading-links/${seg(id)}`, patch),
  remove: (id: string) => http.delete<void>(`/api/reading-links/${seg(id)}`),
  contribute: (id: string, input: ContributionInput) =>
    http.post<void>(`/api/reading-links/${seg(id)}/contribution`, input),
};
