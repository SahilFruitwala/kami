import { create } from "zustand";
import { persist } from "zustand/middleware";
import { HIGHLIGHT_COLORS, type HighlightColorId } from "./library-item.ts";
import { isPaperTone, type PaperTone } from "./paper-tones.ts";

/**
 * Per-device reader preferences: font, size, paper tone, highlight colour,
 * reading progress and a couple of toggles. Kept apart from the library store
 * (server data) and persisted to localStorage.
 *
 * Stored under the same key and version the library store used for these
 * fields, so existing preferences carry over unchanged.
 */

export const READER_FONTS = [
  { id: "newsreader", label: "Newsreader", family: '"Newsreader Variable", Georgia, serif' },
  { id: "literata", label: "Literata", family: '"Literata Variable", Georgia, serif' },
  {
    id: "source-serif",
    label: "Source Serif",
    family: '"Source Serif 4 Variable", Georgia, serif',
  },
  {
    id: "atkinson",
    label: "Atkinson",
    family: '"Atkinson Hyperlegible", ui-sans-serif, sans-serif',
  },
  {
    id: "figtree",
    label: "Figtree",
    family: '"Figtree Variable", ui-sans-serif, system-ui, sans-serif',
  },
] as const;

export type ReaderFontId = (typeof READER_FONTS)[number]["id"];

/** rem sizes from compact → large; default index 2 matches prior "md" */
export const READER_FONT_SIZES = [0.95, 1.0625, 1.1875, 1.3125, 1.4375, 1.5625, 1.75] as const;
export const DEFAULT_READER_FONT_SIZE = 2;

export type ReaderPrefsState = {
  readerFontSize: number;
  readerFont: ReaderFontId;
  highlightColor: HighlightColorId;
  paperTone: PaperTone;
  /**
   * Last explicitly chosen light paper (pale/aged). The global theme toggle
   * restores this when switching back to light mode so a user's "aged"
   * preference survives a dark-mode detour.
   */
  preferredLightTone: PaperTone;
  /** Scroll position per article, 0–1. */
  progressById: Record<string, number>;
  resumeEnabled: boolean;
  /** File new, untagged articles with AI tags and a folder (needs server AI). */
  autoOrganize: boolean;
  setProgress: (id: string, progress: number) => void;
  setReaderFontSize: (size: number) => void;
  bumpReaderFontSize: (delta: number) => void;
  setReaderFont: (font: ReaderFontId) => void;
  setHighlightColor: (color: HighlightColorId) => void;
  setPaperTone: (tone: PaperTone) => void;
  setResumeEnabled: (enabled: boolean) => void;
  setAutoOrganize: (enabled: boolean) => void;
};

type Persisted = {
  readerSize?: "md" | "lg";
  readerFontSize?: number;
  readerFont?: string;
  highlightColor?: string;
  paperTone?: string;
  preferredLightTone?: string;
  progressById?: Record<string, number>;
  resumeEnabled?: boolean;
  autoOrganize?: boolean;
};

function clampFontSize(value: number): number {
  return Math.min(READER_FONT_SIZES.length - 1, Math.max(0, Math.round(value)));
}

function isReaderFont(value: unknown): value is ReaderFontId {
  return READER_FONTS.some((font) => font.id === value);
}

export function isHighlightColor(value: unknown): value is HighlightColorId {
  return HIGHLIGHT_COLORS.some((color) => color.id === value);
}

function migrateFontSize(raw: Persisted): number {
  if (typeof raw.readerFontSize === "number") return clampFontSize(raw.readerFontSize);
  if (raw.readerSize === "lg") return 3;
  return DEFAULT_READER_FONT_SIZE;
}

function migratePrefs(persisted: unknown) {
  const raw = (persisted || {}) as Persisted;
  return {
    readerFontSize: migrateFontSize(raw),
    readerFont: isReaderFont(raw.readerFont) ? raw.readerFont : "newsreader",
    highlightColor: isHighlightColor(raw.highlightColor) ? raw.highlightColor : "vermilion",
    paperTone: isPaperTone(raw.paperTone) ? raw.paperTone : "pale",
    preferredLightTone:
      raw.preferredLightTone === "aged" || raw.preferredLightTone === "pale"
        ? (raw.preferredLightTone as PaperTone)
        : "pale",
    progressById: raw.progressById && typeof raw.progressById === "object" ? raw.progressById : {},
    resumeEnabled: raw.resumeEnabled !== false,
    autoOrganize: raw.autoOrganize !== false,
  } satisfies Partial<ReaderPrefsState>;
}

export const useReaderPrefs = create<ReaderPrefsState>()(
  persist(
    (set) => ({
      readerFontSize: DEFAULT_READER_FONT_SIZE,
      readerFont: "newsreader",
      highlightColor: "vermilion",
      paperTone: "pale",
      preferredLightTone: "pale",
      progressById: {},
      resumeEnabled: true,
      autoOrganize: true,
      setProgress: (id, progress) =>
        set((state) => {
          const clamped = Math.min(1, Math.max(0, progress));
          if (Math.abs((state.progressById[id] ?? 0) - clamped) < 0.005) return state;
          return { progressById: { ...state.progressById, [id]: clamped } };
        }),
      setReaderFontSize: (size) => set({ readerFontSize: clampFontSize(size) }),
      bumpReaderFontSize: (delta) =>
        set((state) => ({ readerFontSize: clampFontSize(state.readerFontSize + delta) })),
      setReaderFont: (font) => set({ readerFont: isReaderFont(font) ? font : "newsreader" }),
      setHighlightColor: (color) =>
        set({ highlightColor: isHighlightColor(color) ? color : "vermilion" }),
      setPaperTone: (tone) => {
        const next = isPaperTone(tone) ? tone : "pale";
        if (next === "sumi") set({ paperTone: next });
        else set({ paperTone: next, preferredLightTone: next });
      },
      setResumeEnabled: (enabled) => set({ resumeEnabled: enabled }),
      setAutoOrganize: (enabled) => set({ autoOrganize: enabled }),
    }),
    {
      // Historical key/version (these fields used to live on the library store).
      name: "quarto-library",
      version: 10,
      partialize: (state) => ({
        readerFontSize: state.readerFontSize,
        readerFont: state.readerFont,
        highlightColor: state.highlightColor,
        paperTone: state.paperTone,
        preferredLightTone: state.preferredLightTone,
        progressById: state.progressById,
        resumeEnabled: state.resumeEnabled,
        autoOrganize: state.autoOrganize,
      }),
      migrate: migratePrefs,
    },
  ),
);
