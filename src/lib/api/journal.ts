import type { JournalEntry } from "@/lib/journal";
import { http, seg } from "./client";

export const journalApi = {
  list: () => http.get<JournalEntry[]>("/api/journal"),

  /** Last-writer-wins by `updatedAt`; returns the stored entry. */
  upsert: ({ date, ...entry }: JournalEntry) =>
    http.put<JournalEntry>(`/api/journal/${seg(date)}`, entry),

  /** Merge a local snapshot into the account; returns the full history. */
  import: (entries: JournalEntry[]) =>
    http.post<JournalEntry[]>("/api/journal/import", { entries }),
};
