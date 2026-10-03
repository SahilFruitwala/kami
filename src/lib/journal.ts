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
  setEntry: (date: string, text: string) => void;
  replaceEntries: (entries: Record<string, JournalEntry>) => void;
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

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function keyFromParts(year: number, monthIndex: number, day: number): string {
  return dayKey(new Date(year, monthIndex, day));
}

export function formatDay(key: string): { weekday: string; label: string; longLabel: string } {
  const date = parseDateKey(key);
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

const WAFU_MONTHS = [
  "Mutsuki",
  "Kisaragi",
  "Yayoi",
  "Uzuki",
  "Satsuki",
  "Minazuki",
  "Fumizuki",
  "Hazuki",
  "Nagatsuki",
  "Kannazuki",
  "Shimotsuki",
  "Shiwasu",
];

const SEASONS: { until: [number, number]; en: string; ja: string }[] = [
  { until: [2, 3], en: "Late Winter", ja: "Banto" },
  { until: [3, 20], en: "Early Spring", ja: "Soshun" },
  { until: [5, 5], en: "Spring", ja: "Haru" },
  { until: [6, 20], en: "Early Summer", ja: "Shoka" },
  { until: [8, 7], en: "Summer", ja: "Natsu" },
  { until: [9, 7], en: "Early Autumn", ja: "Shoshu" },
  { until: [11, 7], en: "Late Autumn", ja: "Banshu" },
  { until: [12, 31], en: "Winter", ja: "Fuyu" },
];

export function wafuMonth(monthIndex: number): string {
  return WAFU_MONTHS[monthIndex] ?? "";
}

export function seasonLabel(key: string): { en: string; ja: string } {
  const date = parseDateKey(key);
  const md: [number, number] = [date.getMonth() + 1, date.getDate()];
  for (const row of SEASONS) {
    if (md[0] < row.until[0] || (md[0] === row.until[0] && md[1] <= row.until[1])) {
      return { en: row.en, ja: row.ja };
    }
  }
  return { en: "Winter", ja: "Fuyu" };
}

/** Approximate synodic moon phase for the seasonal header. */
export function moonPhaseLabel(key: string): string {
  const date = parseDateKey(key);
  const synodic = 29.53058867;
  const knownNew = Date.UTC(2000, 0, 6, 18, 14);
  const days = (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - knownNew) / 86400000;
  const age = ((days % synodic) + synodic) % synodic;
  const t = age / synodic;
  if (t < 0.03 || t > 0.97) return "New Moon";
  if (t < 0.22) return "Waxing Crescent";
  if (t < 0.28) return "First Quarter";
  if (t < 0.47) return "Waxing Gibbous";
  if (t < 0.53) return "Full Moon";
  if (t < 0.72) return "Waning Gibbous";
  if (t < 0.78) return "Last Quarter";
  return "Waning Crescent";
}

export const LONG_INSCRIPTION_WORDS = 250;

export type CalendarCell = {
  key: string;
  day: number;
  inMonth: boolean;
};

export function monthCells(year: number, monthIndex: number): CalendarCell[] {
  const first = new Date(year, monthIndex, 1);
  const startWeekday = first.getDay(); // Sunday = 0, matching Stitch Mo…Su? Stitch starts Mo.
  // Stitch week starts Monday.
  const mondayFirst = (startWeekday + 6) % 7;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const cells: CalendarCell[] = [];
  for (let i = 0; i < mondayFirst; i += 1) {
    const d = new Date(year, monthIndex, 1 - (mondayFirst - i));
    cells.push({ key: dayKey(d), day: d.getDate(), inMonth: false });
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({ key: keyFromParts(year, monthIndex, day), day, inMonth: true });
  }
  while (cells.length % 7 !== 0) {
    const last = parseDateKey(cells[cells.length - 1].key);
    last.setDate(last.getDate() + 1);
    cells.push({ key: dayKey(last), day: last.getDate(), inMonth: false });
  }
  return cells;
}

export function countWords(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return text.trim() ? words.length : 0;
}

export function isDateKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * Daily journal (Nisshi) — paused: local-only store, no server sync.
 * The `journalEntries` table stays in the DB; nothing reads/writes it.
 */
export const useJournalStore = create<JournalState>()(
  persist(
    (set) => ({
      entries: {},
      setEntry: (date, text) => {
        const nextText = text.slice(0, JOURNAL_TEXT_MAX);
        const updatedAt = Date.now();
        set((state) => ({
          entries: {
            ...state.entries,
            [date]: { date, text: nextText, updatedAt },
          },
        }));
      },
      replaceEntries: (entries) => set({ entries }),
      clearAll: () => set({ entries: {} }),
    }),
    { name: "quarto-journal", version: 1 },
  ),
);
