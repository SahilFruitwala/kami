import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  readingLinksApi,
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

export const describeAmount = (e: LinkEvent) =>
  e.unit === "pages" ? `${e.delta} page${e.delta === 1 ? "" : "s"}` : `${e.delta}%`;

/**
 * What the last book update did for linked habits, kept in the query cache so
 * it survives the progress form remounting after a save. Shown inline, with no
 * timer, until you answer it, dismiss it, or save again. Nothing is shown for a
 * book with no links.
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
      (prev ?? []).filter((n) => !(n.event.linkId === e.linkId && n.event.day === e.day)),
    );

  /** Accept a suggestion (sign 1) or take back an automatic tick (sign -1). */
  const send = async (e: LinkEvent, sign: 1 | -1) => {
    try {
      await readingLinksApi.contribute(e.linkId, {
        day: e.day,
        delta: sign * e.delta,
        unit: e.unit,
      });
      drop(e);
      await refresh();
    } catch (err) {
      toastError(err, "Couldn't update that habit.");
    }
  };

  return {
    notices: data,
    accept: (e: LinkEvent) => send(e, 1),
    undo: (e: LinkEvent) => send(e, -1),
    dismiss: drop,
  };
}

/** Replace the notices with what a book update just did. */
export function useAnnounceLinks(bookId: string) {
  const client = useQueryClient();
  return (outcome: LinkOutcome | undefined) => {
    const notices: LinkNotice[] = [
      ...(outcome?.applied ?? []).map((event) => ({ kind: "applied" as const, event })),
      ...(outcome?.suggestions ?? []).map((event) => ({ kind: "suggested" as const, event })),
    ];
    client.setQueryData(noticesKey(bookId), notices);
    if (outcome?.applied.length) {
      void client.invalidateQueries({ queryKey: queryKeys.compass.all });
    }
  };
}
