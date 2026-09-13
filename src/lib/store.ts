import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Article, ArticleSource } from "./article-types.ts";

export type Highlight = {
  id: string;
  text: string;
  note: string;
  createdAt: number;
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

type LibraryState = {
  library: LibraryItem[];
  folders: Folder[];
  openId: string | null;
  readerSize: "md" | "lg";
  ttsRate: number;
  ttsVoiceURI: string;
  upsertItem: (item: LibraryItem) => void;
  archiveItem: (id: string, archived: boolean) => void;
  removeItem: (id: string) => void;
  setOpenId: (id: string | null) => void;
  setReaderSize: (size: "md" | "lg") => void;
  setTtsRate: (rate: number) => void;
  setTtsVoiceURI: (uri: string) => void;
  addFolder: (name: string) => string;
  renameFolder: (id: string, name: string) => void;
  removeFolder: (id: string) => void;
  setItemFolder: (itemId: string, folderId: string | null) => void;
  addTag: (itemId: string, tag: string) => void;
  removeTag: (itemId: string, tag: string) => void;
  addHighlight: (itemId: string, text: string) => Highlight | null;
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
  ttsRate?: number;
  ttsVoiceURI?: string;
};

function migrateItem(row: Persisted["library"] extends (infer T)[] | undefined ? T : never): LibraryItem | null {
  if (!row?.url && !row?.id) return null;
  const url = row.url || row.id || "";
  const words = typeof row.wordCount === "number" ? row.wordCount : 0;
  const tags = Array.isArray(row.tags)
    ? row.tags.map((tag) => normalizeTag(String(tag))).filter(Boolean)
    : [];
  const highlights = Array.isArray(row.highlights)
    ? row.highlights.filter((h) => h && typeof h.text === "string" && h.text.trim())
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
      readerSize: "md",
      ttsRate: 1,
      ttsVoiceURI: "",
      upsertItem: (item) =>
        set((state) => {
          const existing = state.library.find((row) => row.id === item.id || row.url === item.url);
          const merged: LibraryItem = {
            ...item,
            tags: existing?.tags?.length ? existing.tags : item.tags ?? [],
            folderId: existing?.folderId ?? item.folderId ?? null,
            highlights: existing?.highlights?.length ? existing.highlights : item.highlights ?? [],
            archived: existing?.archived ?? item.archived,
            favorited: existing?.favorited ?? item.favorited ?? false,
            note: existing?.note || item.note || "",
          };
          const rest = state.library.filter((row) => row.id !== merged.id && row.url !== merged.url);
          return { library: trimLibrary([merged, ...rest]), openId: merged.id };
        }),
      archiveItem: (id, archived) =>
        set((state) => ({ library: mapItem(state.library, id, (row) => ({ ...row, archived })) })),
      removeItem: (id) =>
        set((state) => ({
          library: state.library.filter((row) => row.id !== id),
          openId: state.openId === id ? null : state.openId,
        })),
      setOpenId: (id) => set({ openId: id }),
      setReaderSize: (size) => set({ readerSize: size }),
      setTtsRate: (rate) => set({ ttsRate: Math.min(1.75, Math.max(0.7, rate)) }),
      setTtsVoiceURI: (uri) => set({ ttsVoiceURI: uri }),
      addFolder: (name) => {
        const trimmed = name.trim().slice(0, 32);
        if (!trimmed) return "";
        const existing = get().folders.find((folder) => folder.name.toLowerCase() === trimmed.toLowerCase());
        if (existing) return existing.id;
        const id = uid();
        set((state) => ({ folders: [...state.folders, { id, name: trimmed }].slice(0, 24) }));
        return id;
      },
      renameFolder: (id, name) => {
        const trimmed = name.trim().slice(0, 32);
        if (!trimmed) return;
        set((state) => ({
          folders: state.folders.map((folder) => (folder.id === id ? { ...folder, name: trimmed } : folder)),
        }));
      },
      removeFolder: (id) =>
        set((state) => ({
          folders: state.folders.filter((folder) => folder.id !== id),
          library: state.library.map((row) => (row.folderId === id ? { ...row, folderId: null } : row)),
        })),
      setItemFolder: (itemId, folderId) =>
        set((state) => ({ library: mapItem(state.library, itemId, (row) => ({ ...row, folderId })) })),
      addTag: (itemId, tag) => {
        const next = normalizeTag(tag);
        if (!next) return;
        set((state) => ({
          library: mapItem(state.library, itemId, (row) => {
            if (row.tags.some((t) => t.toLowerCase() === next.toLowerCase())) return row;
            return { ...row, tags: [...row.tags, next].slice(0, 12) };
          }),
        }));
      },
      removeTag: (itemId, tag) =>
        set((state) => ({
          library: mapItem(state.library, itemId, (row) => ({
            ...row,
            tags: row.tags.filter((t) => t.toLowerCase() !== tag.toLowerCase()),
          })),
        })),
      addHighlight: (itemId, text) => {
        const cleaned = text.replace(/\s+/g, " ").trim();
        if (cleaned.length < 8) return null;
        const highlight: Highlight = { id: uid(), text: cleaned.slice(0, 800), note: "", createdAt: Date.now() };
        set((state) => ({
          library: mapItem(state.library, itemId, (row) => {
            if (row.highlights.some((h) => h.text === highlight.text)) return row;
            return { ...row, highlights: [highlight, ...row.highlights].slice(0, 80) };
          }),
        }));
        return highlight;
      },
      removeHighlight: (itemId, highlightId) =>
        set((state) => ({
          library: mapItem(state.library, itemId, (row) => ({
            ...row,
            highlights: row.highlights.filter((h) => h.id !== highlightId),
          })),
        })),
      setHighlightNote: (itemId, highlightId, note) =>
        set((state) => ({
          library: mapItem(state.library, itemId, (row) => ({
            ...row,
            highlights: row.highlights.map((h) =>
              h.id === highlightId ? { ...h, note: note.slice(0, 280) } : h,
            ),
          })),
        })),
      setFavorited: (itemId, favorited) =>
        set((state) => ({ library: mapItem(state.library, itemId, (row) => ({ ...row, favorited })) })),
      setItemNote: (itemId, note) =>
        set((state) => ({
          library: mapItem(state.library, itemId, (row) => ({ ...row, note: note.slice(0, 2000) })),
        })),
      clearLibrary: () => set({ library: [], openId: null }),
    }),
    {
      name: "quarto-library",
      version: 6,
      migrate: (persisted) => {
        const raw = (persisted || {}) as Persisted;
        const library = (raw.library || []).map(migrateItem).filter((row): row is LibraryItem => Boolean(row));
        return {
          library,
          folders: Array.isArray(raw.folders) ? raw.folders.filter((f) => f?.id && f?.name) : [],
          openId: raw.openId ?? null,
          readerSize: raw.readerSize === "lg" ? "lg" : "md",
          ttsRate: typeof raw.ttsRate === "number" ? raw.ttsRate : 1,
          ttsVoiceURI: raw.ttsVoiceURI || "",
        };
      },
    },
  ),
);
