import type { z } from "zod";
import { http, seg } from "./client";
import type {
  completeInput,
  contributionInput,
  linkInput,
  linkPatch,
  LinkMode,
} from "./schemas/reading-links";

export type { LinkMode };
export type LinkInput = z.input<typeof linkInput>;
export type LinkPatch = z.input<typeof linkPatch>;
export type ContributionInput = z.input<typeof contributionInput>;
export type CompleteInput = z.input<typeof completeInput>;

export type ReadingLink = {
  id: string;
  sourceType: "book" | "folder";
  sourceId: string;
  /** The book's title or folder's name, so a habit can list what feeds it. */
  sourceTitle: string | null;
  /** A book's shelf status (folders have none). */
  sourceStatus: string | null;
  targetType: "habit" | "milestone";
  targetId: string;
  mode: LinkMode;
};

/** A book update that ticked, or could tick, a linked habit on one day. */
export type HabitLinkEvent = {
  kind: "habit";
  linkId: string;
  habitId: string;
  habitName: string;
  day: string;
  /** What this update added, so "Undo" and "Yes" can send it back. */
  delta: number;
  unit: "pages" | "percent";
  label: string;
};

/** A finished book that completed, or could complete, a linked milestone. */
export type MilestoneLinkEvent = {
  kind: "milestone";
  linkId: string;
  milestoneId: string;
  milestoneTitle: string;
  label: string;
};

export type LinkEvent = HabitLinkEvent | MilestoneLinkEvent;

/** A habit a finished book fed, offered for the book being read now. */
export type LinkSuggestion = {
  habitId: string;
  habitName: string;
  fromTitle: string;
  mode: Exclude<LinkMode, "off">;
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
  suggestions: (bookId: string) =>
    http.get<LinkSuggestion[]>("/api/reading-links/suggestions", { bookId }),
  forHabit: (habitId: string) =>
    http.get<ReadingLink[]>("/api/reading-links", { targetType: "habit", targetId: habitId }),
  create: (input: LinkInput) => http.post<ReadingLink>("/api/reading-links", input),
  update: (id: string, patch: LinkPatch) =>
    http.patch<ReadingLink>(`/api/reading-links/${seg(id)}`, patch),
  remove: (id: string) => http.delete<void>(`/api/reading-links/${seg(id)}`),
  complete: (id: string, input: CompleteInput) =>
    http.post<void>(`/api/reading-links/${seg(id)}/complete`, input),
  contribute: (id: string, input: ContributionInput) =>
    http.post<void>(`/api/reading-links/${seg(id)}/contribution`, input),
};
