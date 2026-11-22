import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  readingLinksApi,
  type HabitLinkEvent,
  type LinkEvent,
  type LinkInput,
  type LinkMode,
  type LinkOutcome,
} from "@/lib/api/reading-links";
import { toastError } from "@/lib/errors";
import { queryKeys } from "@/lib/query-client.ts";

/** The habits a book is linked to. */
export function useBookLinks(bookId: string) {
  return useQuery({
    queryKey: queryKeys.readingLinks.book(bookId),
    queryFn: () => readingLinksApi.forBook(bookId),
  });
}

const DISMISSED_KEY = "kami:link-suggestions-dismissed";

const readDismissed = (): string[] => {
  try {
    const raw = window.localStorage.getItem(DISMISSED_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
};

/**
 * Habits a finished book fed, offered for this book. "Not now" is remembered
 * in this browser (a convenience, not an account setting), so the same
 * offer doesn't keep coming back.
 */
export function useLinkSuggestions(bookId: string) {
  const query = useQuery({
    queryKey: queryKeys.readingLinks.suggestions(bookId),
    queryFn: () => readingLinksApi.suggestions(bookId),
  });
  const [dismissed, setDismissed] = useState<string[]>(readDismissed);
  const key = (habitId: string) => `${bookId}:${habitId}`;

  return {
    suggestions: (query.data ?? []).filter((s) => !dismissed.includes(key(s.habitId))),
    dismiss: (habitId: string) => {
      const next = [...dismissed, key(habitId)];
      setDismissed(next);
      try {
        window.localStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
      } catch {
        // Private windows or blocked storage: it just comes back next visit.
      }
    },
  };
}

/** The books feeding a habit. */
export function useHabitLinks(habitId: string) {
  return useQuery({
    queryKey: queryKeys.readingLinks.habit(habitId),
    queryFn: () => readingLinksApi.forHabit(habitId),
  });
}

// A link shows up from both sides (the book's page and the habit), so any change refreshes both.
const refreshLinks = (client: ReturnType<typeof useQueryClient>) =>
  client.invalidateQueries({ queryKey: queryKeys.readingLinks.all });

export function useCreateLink() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: LinkInput) => readingLinksApi.create(input),
    onSuccess: () => refreshLinks(client),
    onError: (err) => toastError(err, "Couldn't link that habit."),
  });
}

export function useSetLinkMode() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; mode: LinkMode }) =>
      readingLinksApi.update(v.id, { mode: v.mode }),
    onSuccess: () => refreshLinks(client),
    onError: (err) => toastError(err, "Couldn't change that link."),
  });
}

export function useRemoveLink() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => readingLinksApi.remove(id),
    onSuccess: () => refreshLinks(client),
    onError: (err) => toastError(err, "Couldn't remove that link."),
  });
}

/** One line under the progress card: something a book update did, or could do. */
export type LinkNotice = { kind: "applied" | "suggested"; event: LinkEvent };

const amount = (e: HabitLinkEvent) =>
  e.unit === "pages" ? `${e.delta} page${e.delta === 1 ? "" : "s"}` : `${e.delta}%`;

export function describeNotice({ kind, event: e }: LinkNotice): string {
  if (e.kind === "milestone") {
    return kind === "applied"
      ? `Marked “${e.milestoneTitle}” done — you finished ${e.label}.`
      : `You finished ${e.label}. Mark “${e.milestoneTitle}” done?`;
  }
  return kind === "applied"
    ? `Ticked “${e.habitName}” — ${amount(e)} of ${e.label} today.`
    : `Count ${amount(e)} of ${e.label} toward “${e.habitName}” today?`;
}

const eventKey = (e: LinkEvent) => (e.kind === "habit" ? `${e.linkId}:${e.day}` : `${e.linkId}:m`);

/**
 * What the last book update did for linked habits and milestones, kept in the
 * query cache so it survives the progress form remounting after a save. Shown
 * inline, with no timer, until you answer it, dismiss it, or save again.
 * Nothing is shown for a book with no links.
 */
const noticesKey = (bookId: string) => queryKeys.readingLinkNotices.book(bookId);

export function useLinkNotices(bookId: string) {
  const client = useQueryClient();
  const key = noticesKey(bookId);
  const { data } = useQuery<LinkNotice[]>({
    queryKey: key,
    queryFn: () => [],
    initialData: [],
    staleTime: Infinity,
    gcTime: Infinity,
  });
  const refresh = () => client.invalidateQueries({ queryKey: queryKeys.compass.all });
  const drop = (e: LinkEvent) =>
    client.setQueryData<LinkNotice[]>(key, (prev) =>
      (prev ?? []).filter((n) => eventKey(n.event) !== eventKey(e)),
    );

  /** Accept a suggestion (sign 1) or take back an automatic change (sign -1). */
  const send = async (e: LinkEvent, sign: 1 | -1) => {
    try {
      if (e.kind === "milestone") {
        await readingLinksApi.complete(e.linkId, { done: sign === 1 });
      } else {
        await readingLinksApi.contribute(e.linkId, {
          day: e.day,
          delta: sign * e.delta,
          unit: e.unit,
        });
      }
      drop(e);
      await refresh();
    } catch (err) {
      toastError(err, "Couldn't update that.");
    }
  };

  return {
    notices: data,
    accept: (e: LinkEvent) => send(e, 1),
    undo: (e: LinkEvent) => send(e, -1),
    dismiss: drop,
  };
}

/** Replace a book's notices with what an update just did. Not a hook, so mutations can call it too. */
export function announceLinks(
  client: ReturnType<typeof useQueryClient>,
  bookId: string,
  outcome: LinkOutcome | undefined,
) {
  const notices: LinkNotice[] = [
    ...(outcome?.applied ?? []).map((event) => ({ kind: "applied" as const, event })),
    ...(outcome?.suggestions ?? []).map((event) => ({ kind: "suggested" as const, event })),
  ];
  client.setQueryData(noticesKey(bookId), notices);
  if (outcome?.applied.length) {
    void client.invalidateQueries({ queryKey: queryKeys.compass.all });
  }
}

export function useAnnounceLinks(bookId: string) {
  const client = useQueryClient();
  return (outcome: LinkOutcome | undefined) => announceLinks(client, bookId, outcome);
}
