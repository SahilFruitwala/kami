import { create } from "zustand";
import { persist } from "zustand/middleware";

export const JOURNAL_TEXT_MAX = 50_000;

export type JournalEntry = {
  /** Calendar day `yyyy-mm-dd` (local). */
  date: string;
  text: string;
  updatedAt: number;
};

type JournalState = {
  entries: Record<string, JournalEntry>;
  setEntry: (date: string, text: string, opts?: { sync?: boolean }) => void;
  replaceEntries: (entries: Record<string, JournalEntry>) => void;
  clearAll: () => void;
};

function remoteSync(run: (m: typeof import("./journal-remote.ts")) => void) {
  void import("./journal-remote.ts")
    .then(run)
    .catch((err) => console.error("[journal]", err));
}

function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayKey(): string {
  return dayKey(new Date());
}

export function keyForOffset(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return dayKey(d);
}

export function formatDay(key: string): { weekday: string; label: string; longLabel: string } {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, (m ?? 1) - 1, d);
  const weekday = date.toLocaleDateString(undefined, { weekday: "short" });
  const label = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const longLabel = date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  return { weekday, label, longLabel };
}

export function countWords(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return text.trim() ? words.length : 0;
}

export function isDateKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * Daily journal (Nisshi) — local cache with server sync via journal-remote.
 */
export const useJournalStore = create<JournalState>()(
  persist(
    (set) => ({
      entries: {},
      setEntry: (date, text, opts) => {
        const nextText = text.slice(0, JOURNAL_TEXT_MAX);
        const updatedAt = Date.now();
        set((state) => ({
          entries: {
            ...state.entries,
            [date]: { date, text: nextText, updatedAt },
          },
        }));
        if (opts?.sync !== false) {
          remoteSync((m) => m.syncUpsertEntry(date, nextText, updatedAt));
        }
      },
      replaceEntries: (entries) => set({ entries }),
      clearAll: () => set({ entries: {} }),
    }),
    { name: "quarto-journal", version: 1 },
  ),
);
