import { create } from "zustand";
import { uid } from "./id.ts";
import {
  LIBRARY_LIMITS,
  normalizeTag,
  type Folder,
  type Highlight,
  type HighlightColorId,
  type LibraryItem,
} from "./library-item.ts";
import { isHighlightColor, useReaderPrefs } from "./reader-prefs.ts";
import { applyHighlightOps, applyTagOps, type TagOp } from "./item-ops.ts";

function remoteSync(run: (m: typeof import("./library-remote.ts")) => void) {
  void import("./library-remote.ts").then(run).catch((err) => console.error("[library]", err));
}

/**
 * Note fields are edited per keystroke; coalesce their server writes so a
 * sentence is one PATCH, not forty. Pending writes flush when the tab hides.
 */
const NOTE_SYNC_DELAY_MS = 700;
const pendingNoteSyncs = new Map<
  string,
  { timer: ReturnType<typeof setTimeout>; run: () => void }
>();

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

export type LibraryState = {
  library: LibraryItem[];
  folders: Folder[];
  /**
   * Server-side article count from the first boot page (null until booted).
   * Headline counts use this so they stay correct while pages stream in.
   */
  libraryTotal: number | null;
  /** True once every boot page has been appended (or the library fit in one). */
  libraryComplete: boolean;
  upsertItem: (item: LibraryItem, opts?: { sync?: boolean }) => void;
  archiveItem: (id: string, archived: boolean) => void;
  removeItem: (id: string) => void;
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
  /** Mirror tags/folders the server already saved (auto-organise), without syncing back. */
  applyOrganized: (done: Array<{ id: string; tags: string[]; folderId: string | null }>) => void;
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

function mapItem(
  library: LibraryItem[],
  id: string,
  fn: (row: LibraryItem) => LibraryItem,
): LibraryItem[] {
  return library.map((row) => (row.id === id ? fn(row) : row));
}

/**
 * Apply one tag rename/remove to every loaded row, then send it to the server
 * once (`POST /api/library/tags`), which also covers rows not paged in yet.
 * Returns how many loaded rows changed.
 */
function applyTagEverywhere(
  set: (fn: (state: LibraryState) => Partial<LibraryState>) => void,
  op: Extract<TagOp, { op: "rename" | "remove" }>,
): number {
  const target = (op.op === "rename" ? op.from : op.tag).toLowerCase();
  let affected = 0;
  set((state) => ({
    library: state.library.map((row) => {
      if (!row.tags.some((t) => t.toLowerCase() === target)) return row;
      affected += 1;
      return { ...row, tags: applyTagOps(row.tags, [op]) };
    }),
  }));
  remoteSync((m) => m.syncTagEverywhere(op));
  return affected;
}

export const useLibraryStore = create<LibraryState>()((set, get) => ({
  library: [],
  folders: [],
  libraryTotal: null,
  libraryComplete: false,
  upsertItem: (item, opts) => {
    let merged: LibraryItem = item;
    set((state) => {
      const existing = state.library.find((row) => row.id === item.id || row.url === item.url);
      merged = {
        ...item,
        tags: existing?.tags?.length ? existing.tags : (item.tags ?? []),
        folderId: existing?.folderId ?? item.folderId ?? null,
        highlights: existing?.highlights?.length ? existing.highlights : (item.highlights ?? []),
        archived: existing?.archived ?? item.archived,
        favorited: existing?.favorited ?? item.favorited ?? false,
        note: existing?.note || item.note || "",
      };
      const rest = state.library.filter((row) => row.id !== merged.id && row.url !== merged.url);
      return { library: [merged, ...rest] };
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
    }));
    remoteSync((m) => m.syncRemoveItem(id));
  },
  addFolder: (name) => {
    const trimmed = name.trim().slice(0, LIBRARY_LIMITS.folderName);
    if (!trimmed) return "";
    const existing = get().folders.find(
      (folder) => folder.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (existing) return existing.id;
    const id = uid();
    set((state) => ({
      folders: [...state.folders, { id, name: trimmed }].slice(0, LIBRARY_LIMITS.folders),
    }));
    remoteSync((m) => m.syncAddFolder({ id, name: trimmed }));
    return id;
  },
  renameFolder: (id, name) => {
    const trimmed = name.trim().slice(0, LIBRARY_LIMITS.folderName);
    if (!trimmed) return;
    set((state) => ({
      folders: state.folders.map((folder) =>
        folder.id === id ? { ...folder, name: trimmed } : folder,
      ),
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
    set((state) => ({
      library: mapItem(state.library, itemId, (row) => ({ ...row, folderId })),
    }));
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
    return applyTagEverywhere(set, { op: "rename", from: oldTag, to: next });
  },
  removeTagEverywhere: (tag) => applyTagEverywhere(set, { op: "remove", tag }),
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
      tags: tags.slice(0, LIBRARY_LIMITS.tags),
      highlights: highlights.slice(0, LIBRARY_LIMITS.highlights),
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
    const picked = isHighlightColor(color) ? color : useReaderPrefs.getState().highlightColor;
    const highlight: Highlight = {
      id: uid(),
      text: cleaned.slice(0, LIBRARY_LIMITS.highlightText),
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
        highlights = [highlight, ...row.highlights].slice(0, LIBRARY_LIMITS.highlights);
        return { ...row, highlights };
      }),
    }));
    // The last colour used becomes the default for the next highlight.
    useReaderPrefs.getState().setHighlightColor(picked);
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
        highlights = row.highlights.map((h) => (h.id === highlightId ? { ...h, color } : h));
        return { ...row, highlights };
      }),
    }));
    useReaderPrefs.getState().setHighlightColor(color);
    if (highlights) {
      remoteSync((m) =>
        m.syncPatchItem(itemId, { highlightOps: [{ op: "update", id: highlightId, color }] }),
      );
    }
  },
  setHighlightNote: (itemId, highlightId, note) => {
    const cleaned = note.slice(0, LIBRARY_LIMITS.highlightNote);
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
    set((state) => ({
      library: mapItem(state.library, itemId, (row) => ({ ...row, favorited })),
    }));
    remoteSync((m) => m.syncPatchItem(itemId, { favorited }));
  },
  setItemNote: (itemId, note) => {
    const cleaned = note.slice(0, LIBRARY_LIMITS.note);
    set((state) => ({
      library: mapItem(state.library, itemId, (row) => ({ ...row, note: cleaned })),
    }));
    debouncedRemoteSync(`item-note:${itemId}`, (m) => m.syncPatchItem(itemId, { note: cleaned }));
  },
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
  clearLibrary: () => set({ library: [] }),
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
}));
