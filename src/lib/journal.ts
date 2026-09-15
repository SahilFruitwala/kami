import { create } from "zustand";
import { persist } from "zustand/middleware";

export type JournalEntry = {
  /** Calendar day `yyyy-mm-dd` (local). */
  date: string;
  text: string;
  updatedAt: number;
};

type JournalState = {
  entries: Record<string, JournalEntry>;
  setEntry: (date: string, text: string) => void;
  clearAll: () => void;
};

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

export function formatDay(key: string): { weekday: string; label: string } {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, (m ?? 1) - 1, d);
  const weekday = date.toLocaleDateString(undefined, { weekday: "short" });
  const label = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return { weekday, label };
}

export function countWords(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return text.trim() ? words.length : 0;
}

/**
 * Daily journal (Nisshi) — local-first v1, persisted on-device.
 * Server sync (journal_entries table) is a follow-up once the pane settles.
 */
export const useJournalStore = create<JournalState>()(
  persist(
    (set) => ({
      entries: {},
      setEntry: (date, text) =>
        set((state) => ({
          entries: {
            ...state.entries,
            [date]: { date, text, updatedAt: Date.now() },
          },
        })),
      clearAll: () => set({ entries: {} }),
    }),
    { name: "quarto-journal", version: 1 },
  ),
);
