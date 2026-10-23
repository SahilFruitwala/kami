import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Article, ArticleSource } from "./article-types.ts";
import { isPaperTone, type PaperTone } from "./paper-tones.ts";
import { HIGHLIGHT_NOTE_MAX, applyHighlightOps, applyTagOps } from "./item-ops.ts";
import type { TidyState } from "./tidy-state.ts";

function remoteSync(run: (m: typeof import("./library-remote.ts")) => void) {
  void import("./library-remote.ts")
    .then(run)
    .catch((err) => console.error("[library]", err));
}

/**
 * Note fields are edited per keystroke; coalesce their server writes so a
 * sentence is one PATCH, not forty. Pending writes flush when the tab hides.
 */
const NOTE_SYNC_DELAY_MS = 700;
const pendingNoteSyncs = new Map<string, { timer: ReturnType<typeof setTimeout>; run: () => void }>();

function debouncedRemoteSync(key: string, run: (m: typeof import("./library-remote.ts")) => void) {
  const prev = pendingNoteSyncs.get(key);
  if (prev) clearTimeout(prev.timer);
  const fire = () => {
    pendingNoteSyncs.delete(key);
    remoteSync(run);
  };
  pendingNoteSyncs.set(key, { timer: setTimeout(fire, NOTE_SYNC_DELAY_MS), run: fire });
}

/** Send every coalesced note write now (tab hidden / page leaving). */
export function flushPendingNoteSyncs() {
  for (const { timer, run } of [...pendingNoteSyncs.values()]) {
    clearTimeout(timer);
    run();
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flushPendingNoteSyncs);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushPendingNoteSyncs();
  });
}

/** Ink colors for highlights — Dokusho toolbar (Vermilion / Bamboo / Sumi). */
export const HIGHLIGHT_COLORS = [
  { id: "vermilion", label: "Vermilion", swatch: "#c84b31" },
  { id: "bamboo", label: "Bamboo", swatch: "#6e7d6a" },
  { id: "sumi", label: "Sumi", swatch: "#43403a" },
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
  /** Server-owned: where the saved copy is in the Tidy lifecycle. */
  tidyState?: TidyState;
  /** Server-owned: an Original copy exists and can be restored. */
  hasOriginal?: boolean;
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
  { id: "newsreader", label: "Newsreader", family: '"Newsreader Variable", "Newsreader", "Iowan Old Style", Georgia, serif' },
  { id: "literata", label: "Literata", family: '"Literata", Georgia, serif' },
  { id: "source-serif", label: "Source Serif", family: 'Georgia, "Iowan Old Style", serif' },
  { id: "atkinson", label: "Atkinson", family: '"Atkinson Hyperlegible", ui-sans-serif, sans-serif' },
  { id: "figtree", label: "Figtree", family: 'ui-sans-serif, system-ui, sans-serif' },
] as const;

export type ReaderFontId = (typeof READER_FONTS)[number]["id"];

/** rem sizes from compact → large; default index 2 matches prior "md" */
export const READER_FONT_SIZES = [0.95, 1.0625, 1.1875, 1.3125, 1.4375, 1.5625, 1.75] as const;
export const DEFAULT_READER_FONT_SIZE = 2;

export type LibraryState = {
  library: LibraryItem[];
  folders: Folder[];
  openId: string | null;
  /**
   * Server-side article count from the first boot page (null until booted).
   * Headline counts use this so they stay correct while pages stream in.
   */
  libraryTotal: number | null;
  /** True once every boot page has been appended (or the library fit in one). */
  libraryComplete: boolean;
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
  progressById: Record<string, number>;
  resumeEnabled: boolean;
  /** File new, untagged articles with AI tags and a folder (needs server AI). */
  autoOrganize: boolean;
  setProgress: (id: string, progress: number) => void;
  upsertItem: (item: LibraryItem, opts?: { sync?: boolean }) => void;  archiveItem: (id: string, archived: boolean) => void;
  removeItem: (id: string) => void;
  setOpenId: (id: string | null) => void;
  setReaderFontSize: (size: number) => void;
  bumpReaderFontSize: (delta: number) => void;
  setReaderFont: (font: ReaderFontId) => void;
  setHighlightColor: (color: HighlightColorId) => void;
  setPaperTone: (tone: PaperTone) => void;
  addFolder: (name: string) => string;
  renameFolder: (id: string, name: string) => void;
  removeFolder: (id: string) => void;
  setItemFolder: (itemId: string, folderId: string | null) => void;
  addTag: (itemId: string, tag: string) => void;
  removeTag: (itemId: string, tag: string) => void;
  renameTagEverywhere: (oldTag: string, newTag: string) => number;
  removeTagEverywhere: (tag: string) => number;
  mergeItems: (keepId: string, dropId: string) => void;
  addHighlight: (itemId: string, text: string, color?: HighlightColorId) => Highlight | null;
  removeHighlight: (itemId: string, highlightId: string) => void;
  /** Put back a removed highlight (undo) with its original id, note and date. */
  restoreHighlight: (itemId: string, highlight: Highlight) => void;
  setHighlightColorById: (itemId: string, highlightId: string, color: HighlightColorId) => void;
  setHighlightNote: (itemId: string, highlightId: string, note: string) => void;
  setFavorited: (itemId: string, favorited: boolean) => void;
  setItemNote: (itemId: string, note: string) => void;
  setResumeEnabled: (enabled: boolean) => void;
  setAutoOrganize: (enabled: boolean) => void;
  /** Mirror tags/folders the server already saved (auto-organise), without syncing back. */
  applyOrganized: (
    done: Array<{ id: string; tags: string[]; folderId: string | null }>,
  ) => void;
  clearLibrary: () => void;
  /** Replace the whole library (boot page 1 or a full snapshot). */
  setLibrarySnapshot: (
    library: LibraryItem[],
    folders: Folder[],
    total: number | null,
    complete: boolean,
  ) => void;
  /** Append a follow-up boot page, deduping by id against loaded rows. */
  appendLibraryItems: (items: LibraryItem[], complete: boolean) => void;
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

function isHighlightColor(value: unknown): value is HighlightColorId {
  return HIGHLIGHT_COLORS.some((color) => color.id === value);
}

function migrateFontSize(raw: Persisted): number {
  if (typeof raw.readerFontSize === "number") return clampFontSize(raw.readerFontSize);
  if (raw.readerSize === "lg") return 3;
  return DEFAULT_READER_FONT_SIZE;
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
      libraryTotal: null,
      libraryComplete: false,
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
      upsertItem: (item, opts) => {
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
        if (opts?.sync === false) return;
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
        set({ highlightColor: isHighlightColor(color) ? color : "vermilion" }),
      setPaperTone: (tone) => {
        const next = isPaperTone(tone) ? tone : "pale";
        if (next === "sumi") set({ paperTone: next });
        else set({ paperTone: next, preferredLightTone: next });
      },
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
        let changed = false;
        set((state) => ({
          library: mapItem(state.library, itemId, (row) => {
            const tags = applyTagOps(row.tags, [{ op: "add", tag: next }]);
            if (tags.length === row.tags.length) return row;
            changed = true;
            return { ...row, tags };
          }),
        }));
        if (changed) {
          remoteSync((m) => m.syncPatchItem(itemId, { tagOps: [{ op: "add", tag: next }] }));
        }
      },
      removeTag: (itemId, tag) => {
        set((state) => ({
          library: mapItem(state.library, itemId, (row) => ({
            ...row,
            tags: applyTagOps(row.tags, [{ op: "remove", tag }]),
          })),
        }));
        remoteSync((m) => m.syncPatchItem(itemId, { tagOps: [{ op: "remove", tag }] }));
      },
      renameTagEverywhere: (oldTag, newTag) => {
        const next = normalizeTag(newTag);
        if (!next) return 0;
        const old = oldTag.toLowerCase();
        let affected = 0;
        const touched: Array<{ id: string; tags: string[] }> = [];
        set((state) => ({
          library: state.library.map((row) => {
            if (!row.tags.some((t) => t.toLowerCase() === old)) return row;
            affected += 1;
            const tags = row.tags
              .map((t) => (t.toLowerCase() === old ? next : t))
              .filter((t, i, arr) => arr.findIndex((x) => x.toLowerCase() === t.toLowerCase()) === i)
              .slice(0, 12);
            touched.push({ id: row.id, tags });
            return { ...row, tags };
          }),
        }));
        for (const t of touched) {
          remoteSync((m) =>
            m.syncPatchItem(t.id, { tagOps: [{ op: "rename", from: oldTag, to: next }] }),
          );
        }
        return affected;
      },
      removeTagEverywhere: (tag) => {
        const old = tag.toLowerCase();
        let affected = 0;
        const touched: Array<{ id: string; tags: string[] }> = [];
        set((state) => ({
          library: state.library.map((row) => {
            if (!row.tags.some((t) => t.toLowerCase() === old)) return row;
            affected += 1;
            const tags = row.tags.filter((t) => t.toLowerCase() !== old);
            touched.push({ id: row.id, tags });
            return { ...row, tags };
          }),
        }));
        for (const t of touched) {
          remoteSync((m) => m.syncPatchItem(t.id, { tagOps: [{ op: "remove", tag }] }));
        }
        return affected;
      },
      mergeItems: (keepId, dropId) => {
        const state = get();
        const keep = state.library.find((row) => row.id === keepId);
        const drop = state.library.find((row) => row.id === dropId);
        if (!keep || !drop || keepId === dropId) return;
        // Union inline (avoids a store→export import cycle).
        const tags = [...keep.tags];
        for (const t of drop.tags) {
          const clean = normalizeTag(t);
          if (clean && !tags.some((x) => x.toLowerCase() === clean.toLowerCase())) tags.push(clean);
        }
        const seen = new Set(keep.highlights.map((h) => h.text));
        const highlights = [...keep.highlights];
        for (const h of drop.highlights) {
          if (!seen.has(h.text)) {
            seen.add(h.text);
            highlights.push(h);
          }
        }
        highlights.sort((a, b) => b.createdAt - a.createdAt);
        const merged: LibraryItem = {
          ...keep,
          tags: tags.slice(0, 12),
          highlights: highlights.slice(0, 80),
          savedAt: Math.min(keep.savedAt, drop.savedAt),
          contentHtml: keep.contentHtml || drop.contentHtml,
          excerpt: keep.excerpt || drop.excerpt,
          heroImage: keep.heroImage ?? drop.heroImage,
          favorited: keep.favorited || drop.favorited,
          note: keep.note || drop.note,
          folderId: keep.folderId ?? drop.folderId,
        };
        set((s) => ({
          library: [merged, ...s.library.filter((row) => row.id !== keepId && row.id !== dropId)],
        }));
        remoteSync((m) => m.syncUpsertItem(merged));
        remoteSync((m) => m.syncRemoveItem(dropId));
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
        if (highlights) {
          remoteSync((m) => m.syncPatchItem(itemId, { highlightOps: [{ op: "add", highlight }] }));
        }
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
        if (highlights) {
          remoteSync((m) =>
            m.syncPatchItem(itemId, { highlightOps: [{ op: "remove", id: highlightId }] }),
          );
        }
      },
      restoreHighlight: (itemId, highlight) => {
        let restored = false;
        set((state) => ({
          library: mapItem(state.library, itemId, (row) => {
            const highlights = applyHighlightOps(row.highlights, [{ op: "add", highlight }]);
            restored = highlights.some((h) => h.id === highlight.id);
            return restored ? { ...row, highlights } : row;
          }),
        }));
        if (restored) {
          remoteSync((m) => m.syncPatchItem(itemId, { highlightOps: [{ op: "add", highlight }] }));
        }
      },
      setHighlightColorById: (itemId, highlightId, color) => {
        if (!isHighlightColor(color)) return;
        let highlights: Highlight[] | undefined;
        set((state) => ({
          library: mapItem(state.library, itemId, (row) => {
            highlights = row.highlights.map((h) =>
              h.id === highlightId ? { ...h, color } : h,
            );
            return { ...row, highlights };
          }),
          highlightColor: color,
        }));
        if (highlights) {
          remoteSync((m) =>
            m.syncPatchItem(itemId, { highlightOps: [{ op: "update", id: highlightId, color }] }),
          );
        }
      },
      setHighlightNote: (itemId, highlightId, note) => {
        const cleaned = note.slice(0, HIGHLIGHT_NOTE_MAX);
        let highlights: Highlight[] | undefined;
        set((state) => ({
          library: mapItem(state.library, itemId, (row) => {
            highlights = row.highlights.map((h) =>
              h.id === highlightId ? { ...h, note: cleaned } : h,
            );
            return { ...row, highlights };
          }),
        }));
        if (highlights) {
          debouncedRemoteSync(`hl-note:${itemId}:${highlightId}`, (m) =>
            m.syncPatchItem(itemId, {
              highlightOps: [{ op: "update", id: highlightId, note: cleaned }],
            }),
          );
        }
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
        debouncedRemoteSync(`item-note:${itemId}`, (m) => m.syncPatchItem(itemId, { note: cleaned }));
      },
      setResumeEnabled: (enabled) => set({ resumeEnabled: enabled }),
      setAutoOrganize: (enabled) => set({ autoOrganize: enabled }),
      applyOrganized: (done) => {
        if (done.length === 0) return;
        const byId = new Map(done.map((d) => [d.id, d]));
        set((state) => ({
          library: state.library.map((row) => {
            const hit = byId.get(row.id);
            return hit ? { ...row, tags: hit.tags, folderId: hit.folderId ?? row.folderId } : row;
          }),
        }));
      },
      clearLibrary: () => set({ library: [], openId: null }),
      setLibrarySnapshot: (library, folders, total, complete) =>
        set({ library, folders, libraryTotal: total, libraryComplete: complete }),
      appendLibraryItems: (items, complete) =>
        set((state) => {
          const seen = new Set(state.library.map((row) => row.id));
          const fresh = items.filter((row) => !seen.has(row.id));
          if (fresh.length === 0) {
            return state.libraryComplete === complete ? state : { libraryComplete: complete };
          }
          return { library: [...state.library, ...fresh], libraryComplete: complete };
        }),
    }),
    {
      name: "quarto-library",
      version: 10,
      // Library rows live in Postgres now; only reader prefs stay on-device.
      partialize: (state) => ({
        openId: state.openId,
        readerFontSize: state.readerFontSize,
        readerFont: state.readerFont,
        highlightColor: state.highlightColor,
        paperTone: state.paperTone,
        preferredLightTone: state.preferredLightTone,
        progressById: state.progressById,
        resumeEnabled: state.resumeEnabled,
        autoOrganize: state.autoOrganize,
      }),
      migrate: (persisted) => {
        const raw = (persisted || {}) as Persisted;
        return {
          library: [],
          folders: [],
          openId: raw.openId ?? null,
          libraryTotal: null,
          libraryComplete: false,
          readerFontSize: migrateFontSize(raw),
          readerFont: isReaderFont(raw.readerFont) ? raw.readerFont : "newsreader",
          highlightColor: isHighlightColor(raw.highlightColor) ? raw.highlightColor : "vermilion",
          paperTone: isPaperTone(raw.paperTone) ? raw.paperTone : "pale",
          preferredLightTone:
            raw.preferredLightTone === "aged" || raw.preferredLightTone === "pale"
              ? (raw.preferredLightTone as PaperTone)
              : "pale",
          progressById:
            raw.progressById && typeof raw.progressById === "object" ? raw.progressById : {},
          resumeEnabled: raw.resumeEnabled === false ? false : true,
          autoOrganize: raw.autoOrganize === false ? false : true,
        };
      },
    },
  ),
);
