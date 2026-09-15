import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Article, ArticleSource } from "./article-types.ts";

function remoteSync(run: (m: typeof import("./library-remote.ts")) => void) {
  void import("./library-remote.ts")
    .then(run)
    .catch((err) => console.error("[library]", err));
}

export const HIGHLIGHT_COLORS = [
  { id: "amber", label: "Amber", swatch: "#e8c97a" },
  { id: "lemon", label: "Lemon", swatch: "#f0e07a" },
  { id: "mint", label: "Mint", swatch: "#a8d5b5" },
  { id: "sky", label: "Sky", swatch: "#a8c8e8" },
  { id: "rose", label: "Rose", swatch: "#e8b4c0" },
] as const;

export type HighlightColorId = (typeof HIGHLIGHT_COLORS)[number]["id"];

export type Highlight = {
  id: string;
  text: string;
  note: string;
  createdAt: number;
  color: HighlightColorId;
};

export type Folder = {
  id: string;
  name: string;
};

export type LibraryItem = {
  id: string;
  url: string;
  canonicalUrl: string;
  title: string;
  author: string;
  siteName: string;
  source: ArticleSource;
  wordCount: number;
  readingMinutes: number;
  excerpt: string;
  contentHtml: string;
  heroImage: string | null;
  published: string | null;
  savedAt: number;
  archived: boolean;
  tags: string[];
  folderId: string | null;
  highlights: Highlight[];
  favorited: boolean;
  note: string;
};

export function articleIdFromUrl(url: string): string {
  return url.replace(/#.*$/, "");
}

export function uid(): string {
  return crypto.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeTag(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, 28);
}

export function itemToArticle(item: LibraryItem): Article {
  return {
    url: item.url,
    canonicalUrl: item.canonicalUrl || item.url,
    title: item.title,
    author: item.author,
    siteName: item.siteName,
    published: item.published,
    excerpt: item.excerpt,
    contentHtml: item.contentHtml,
    wordCount: item.wordCount,
    readingMinutes: item.readingMinutes,
    source: item.source,
    heroImage: item.heroImage,
  };
}

export function articleToItem(article: Article, extras: Partial<LibraryItem> = {}): LibraryItem {
  const now = Date.now();
  return {
    id: articleIdFromUrl(article.canonicalUrl || article.url),
    url: article.url,
    canonicalUrl: article.canonicalUrl || article.url,
    title: article.title,
    author: article.author,
    siteName: article.siteName,
    source: article.source,
    wordCount: article.wordCount,
    readingMinutes: article.readingMinutes,
    excerpt: article.excerpt,
    contentHtml: article.contentHtml,
    heroImage: article.heroImage,
    published: article.published,
    savedAt: now,
    archived: false,
    tags: [],
    folderId: null,
    highlights: [],
    favorited: false,
    note: "",
    ...extras,
  };
}

export const READER_FONTS = [
  { id: "newsreader", label: "Newsreader", family: '"Newsreader", "Iowan Old Style", Georgia, serif' },
  { id: "literata", label: "Literata", family: '"Literata", Georgia, serif' },
  { id: "source-serif", label: "Source Serif", family: '"Source Serif 4", Georgia, serif' },
  { id: "atkinson", label: "Atkinson", family: '"Atkinson Hyperlegible", ui-sans-serif, sans-serif' },
  { id: "figtree", label: "Figtree", family: '"Figtree", ui-sans-serif, system-ui, sans-serif' },
] as const;

export type ReaderFontId = (typeof READER_FONTS)[number]["id"];

/** rem sizes from compact → large; default index 2 matches prior "md" */
export const READER_FONT_SIZES = [0.95, 1.0625, 1.1875, 1.3125, 1.4375, 1.5625, 1.75] as const;
export const DEFAULT_READER_FONT_SIZE = 2;

export type LibraryState = {
  library: LibraryItem[];
  folders: Folder[];
  openId: string | null;
  readerFontSize: number;
  readerFont: ReaderFontId;
  highlightColor: HighlightColorId;
  ttsRate: number;
  ttsVoiceURI: string;
  upsertItem: (item: LibraryItem) => void;
  archiveItem: (id: string, archived: boolean) => void;
  removeItem: (id: string) => void;
  setOpenId: (id: string | null) => void;
  setReaderFontSize: (size: number) => void;
  bumpReaderFontSize: (delta: number) => void;
  setReaderFont: (font: ReaderFontId) => void;
  setHighlightColor: (color: HighlightColorId) => void;
  setTtsRate: (rate: number) => void;
  setTtsVoiceURI: (uri: string) => void;
  addFolder: (name: string) => string;
  renameFolder: (id: string, name: string) => void;
  removeFolder: (id: string) => void;
  setItemFolder: (itemId: string, folderId: string | null) => void;
  addTag: (itemId: string, tag: string) => void;
  removeTag: (itemId: string, tag: string) => void;
  addHighlight: (itemId: string, text: string, color?: HighlightColorId) => Highlight | null;
  removeHighlight: (itemId: string, highlightId: string) => void;
  setHighlightNote: (itemId: string, highlightId: string, note: string) => void;
  setFavorited: (itemId: string, favorited: boolean) => void;
  setItemNote: (itemId: string, note: string) => void;
  clearLibrary: () => void;
};

type Persisted = {
  kindleEmail?: string;
  library?: Array<Partial<LibraryItem> & { id?: string; url?: string; title?: string; preparedAt?: number }>;
  folders?: Folder[];
  openId?: string | null;
  readerSize?: "md" | "lg";
  readerFontSize?: number;
  readerFont?: string;
  highlightColor?: string;
  ttsRate?: number;
  ttsVoiceURI?: string;
};

function clampFontSize(value: number): number {
  return Math.min(READER_FONT_SIZES.length - 1, Math.max(0, Math.round(value)));
}

function isReaderFont(value: unknown): value is ReaderFontId {
  return READER_FONTS.some((font) => font.id === value);
}

function isHighlightColor(value: unknown): value is HighlightColorId {
  return HIGHLIGHT_COLORS.some((color) => color.id === value);
}

function migrateFontSize(raw: Persisted): number {
  if (typeof raw.readerFontSize === "number") return clampFontSize(raw.readerFontSize);
  if (raw.readerSize === "lg") return 3;
  return DEFAULT_READER_FONT_SIZE;
}

function migrateItem(row: Persisted["library"] extends (infer T)[] | undefined ? T : never): LibraryItem | null {
  if (!row?.url && !row?.id) return null;
  const url = row.url || row.id || "";
  const words = typeof row.wordCount === "number" ? row.wordCount : 0;
  const tags = Array.isArray(row.tags)
    ? row.tags.map((tag) => normalizeTag(String(tag))).filter(Boolean)
    : [];
  const highlights = Array.isArray(row.highlights)
    ? row.highlights
        .filter((h) => h && typeof h.text === "string" && h.text.trim())
        .map((h) => ({
          id: typeof h.id === "string" ? h.id : uid(),
          text: String(h.text).trim().slice(0, 800),
          note: typeof h.note === "string" ? h.note.slice(0, 280) : "",
          createdAt: typeof h.createdAt === "number" ? h.createdAt : Date.now(),
          color: isHighlightColor(h.color) ? h.color : ("amber" as HighlightColorId),
        }))
    : [];
  return {
    id: row.id || articleIdFromUrl(url),
    url,
    canonicalUrl: row.canonicalUrl || url,
    title: row.title || "Untitled",
    author: row.author || "",
    siteName: row.siteName || "",
    source: row.source === "x" ? "x" : "blog",
    wordCount: words,
    readingMinutes: row.readingMinutes || Math.max(1, Math.round(words / 200) || 1),
    excerpt: row.excerpt || "",
    contentHtml: row.contentHtml || "",
    heroImage: row.heroImage ?? null,
    published: row.published ?? null,
    savedAt: row.savedAt || row.preparedAt || Date.now(),
    archived: Boolean(row.archived),
    tags,
    folderId: row.folderId || null,
    highlights,
    favorited: Boolean(row.favorited),
    note: typeof row.note === "string" ? row.note.slice(0, 2000) : "",
  };
}

function trimLibrary(items: LibraryItem[], max = 200): LibraryItem[] {
  if (items.length <= max) return items;
  const next = [...items];
  while (next.length > max) {
    let idx = -1;
    for (let i = next.length - 1; i >= 0; i -= 1) {
      if (next[i].archived && !next[i].favorited) {
        idx = i;
        break;
      }
    }
    if (idx < 0) idx = next.length - 1;
    next.splice(idx, 1);
  }
  return next;
}

function mapItem(library: LibraryItem[], id: string, fn: (row: LibraryItem) => LibraryItem): LibraryItem[] {
  return library.map((row) => (row.id === id ? fn(row) : row));
}

export const useLibraryStore = create<LibraryState>()(
  persist(
    (set, get) => ({
      library: [],
      folders: [],
      openId: null,
      readerFontSize: DEFAULT_READER_FONT_SIZE,
      readerFont: "literata",
      highlightColor: "amber",
      ttsRate: 1,
      ttsVoiceURI: "",
      upsertItem: (item) => {
        let merged: LibraryItem = item;
        set((state) => {
          const existing = state.library.find((row) => row.id === item.id || row.url === item.url);
          merged = {
            ...item,
            tags: existing?.tags?.length ? existing.tags : item.tags ?? [],
            folderId: existing?.folderId ?? item.folderId ?? null,
            highlights: existing?.highlights?.length ? existing.highlights : item.highlights ?? [],
            archived: existing?.archived ?? item.archived,
            favorited: existing?.favorited ?? item.favorited ?? false,
            note: existing?.note || item.note || "",
          };
          const rest = state.library.filter((row) => row.id !== merged.id && row.url !== merged.url);
          return { library: trimLibrary([merged, ...rest]) };
        });
        remoteSync((m) => m.syncUpsertItem(merged));
      },
      archiveItem: (id, archived) => {
        set((state) => ({ library: mapItem(state.library, id, (row) => ({ ...row, archived })) }));
        remoteSync((m) => m.syncArchiveItem(id, archived));
      },
      removeItem: (id) => {
        set((state) => ({
          library: state.library.filter((row) => row.id !== id),
          openId: state.openId === id ? null : state.openId,
        }));
        remoteSync((m) => m.syncRemoveItem(id));
      },
      setOpenId: (id) => set({ openId: id }),
      setReaderFontSize: (size) => set({ readerFontSize: clampFontSize(size) }),
      bumpReaderFontSize: (delta) =>
        set((state) => ({ readerFontSize: clampFontSize(state.readerFontSize + delta) })),
      setReaderFont: (font) => set({ readerFont: isReaderFont(font) ? font : "newsreader" }),
      setHighlightColor: (color) =>
        set({ highlightColor: isHighlightColor(color) ? color : "amber" }),
      setTtsRate: (rate) => set({ ttsRate: Math.min(1.75, Math.max(0.7, rate)) }),
      setTtsVoiceURI: (uri) => set({ ttsVoiceURI: uri }),
      addFolder: (name) => {
        const trimmed = name.trim().slice(0, 32);
        if (!trimmed) return "";
        const existing = get().folders.find((folder) => folder.name.toLowerCase() === trimmed.toLowerCase());
        if (existing) return existing.id;
        const id = uid();
        set((state) => ({ folders: [...state.folders, { id, name: trimmed }].slice(0, 24) }));
        remoteSync((m) => m.syncAddFolder({ id, name: trimmed }));
        return id;
      },
      renameFolder: (id, name) => {
        const trimmed = name.trim().slice(0, 32);
        if (!trimmed) return;
        set((state) => ({
          folders: state.folders.map((folder) => (folder.id === id ? { ...folder, name: trimmed } : folder)),
        }));
        remoteSync((m) => m.syncRenameFolder(id, trimmed));
      },
      removeFolder: (id) => {
        set((state) => ({
          folders: state.folders.filter((folder) => folder.id !== id),
          library: state.library.map((row) => (row.folderId === id ? { ...row, folderId: null } : row)),
        }));
        remoteSync((m) => m.syncRemoveFolder(id));
      },
      setItemFolder: (itemId, folderId) => {
        set((state) => ({ library: mapItem(state.library, itemId, (row) => ({ ...row, folderId })) }));
        remoteSync((m) => m.syncPatchItem(itemId, { folderId }));
      },
      addTag: (itemId, tag) => {
        const next = normalizeTag(tag);
        if (!next) return;
        let tags: string[] | undefined;
        set((state) => ({
          library: mapItem(state.library, itemId, (row) => {
            if (row.tags.some((t) => t.toLowerCase() === next.toLowerCase())) {
              tags = row.tags;
              return row;
            }
            tags = [...row.tags, next].slice(0, 12);
            return { ...row, tags };
          }),
        }));
        if (tags) remoteSync((m) => m.syncPatchItem(itemId, { tags }));
      },
      removeTag: (itemId, tag) => {
        let tags: string[] | undefined;
        set((state) => ({
          library: mapItem(state.library, itemId, (row) => {
            tags = row.tags.filter((t) => t.toLowerCase() !== tag.toLowerCase());
            return { ...row, tags };
          }),
        }));
        if (tags) remoteSync((m) => m.syncPatchItem(itemId, { tags }));
      },
      addHighlight: (itemId, text, color) => {
        const cleaned = text.replace(/\s+/g, " ").trim();
        if (cleaned.length < 8) return null;
        const picked = isHighlightColor(color) ? color : get().highlightColor;
        const highlight: Highlight = {
          id: uid(),
          text: cleaned.slice(0, 800),
          note: "",
          createdAt: Date.now(),
          color: picked,
        };
        let highlights: Highlight[] | undefined;
        set((state) => ({
          library: mapItem(state.library, itemId, (row) => {
            if (row.highlights.some((h) => h.text === highlight.text)) {
              highlights = row.highlights;
              return row;
            }
            highlights = [highlight, ...row.highlights].slice(0, 80);
            return { ...row, highlights };
          }),
          highlightColor: picked,
        }));
        if (highlights) remoteSync((m) => m.syncPatchItem(itemId, { highlights }));
        return highlight;
      },
      removeHighlight: (itemId, highlightId) => {
        let highlights: Highlight[] | undefined;
        set((state) => ({
          library: mapItem(state.library, itemId, (row) => {
            highlights = row.highlights.filter((h) => h.id !== highlightId);
            return { ...row, highlights };
          }),
        }));
        if (highlights) remoteSync((m) => m.syncPatchItem(itemId, { highlights }));
      },
      setHighlightNote: (itemId, highlightId, note) => {
        let highlights: Highlight[] | undefined;
        set((state) => ({
          library: mapItem(state.library, itemId, (row) => {
            highlights = row.highlights.map((h) =>
              h.id === highlightId ? { ...h, note: note.slice(0, 280) } : h,
            );
            return { ...row, highlights };
          }),
        }));
        if (highlights) remoteSync((m) => m.syncPatchItem(itemId, { highlights }));
      },
      setFavorited: (itemId, favorited) => {
        set((state) => ({ library: mapItem(state.library, itemId, (row) => ({ ...row, favorited })) }));
        remoteSync((m) => m.syncPatchItem(itemId, { favorited }));
      },
      setItemNote: (itemId, note) => {
        const cleaned = note.slice(0, 2000);
        set((state) => ({
          library: mapItem(state.library, itemId, (row) => ({ ...row, note: cleaned })),
        }));
        remoteSync((m) => m.syncPatchItem(itemId, { note: cleaned }));
      },
      clearLibrary: () => set({ library: [], openId: null }),
    }),
    {
      name: "quarto-library",
      version: 9,
      // Library rows live in Postgres now; only reader prefs stay on-device.
      partialize: (state) => ({
        openId: state.openId,
        readerFontSize: state.readerFontSize,
        readerFont: state.readerFont,
        highlightColor: state.highlightColor,
        ttsRate: state.ttsRate,
        ttsVoiceURI: state.ttsVoiceURI,
      }),
      migrate: (persisted) => {
        const raw = (persisted || {}) as Persisted;
        return {
          library: [],
          folders: [],
          openId: raw.openId ?? null,
          readerFontSize: migrateFontSize(raw),
          readerFont: isReaderFont(raw.readerFont) ? raw.readerFont : "newsreader",
          highlightColor: isHighlightColor(raw.highlightColor) ? raw.highlightColor : "amber",
          ttsRate: typeof raw.ttsRate === "number" ? raw.ttsRate : 1,
          ttsVoiceURI: raw.ttsVoiceURI || "",
        };
      },
    },
  ),
);
