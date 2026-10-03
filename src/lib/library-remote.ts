import {
  LIBRARY_BOOT_LIMIT,
  addLibraryFolder,
  getLibrary,
  importLibrarySnapshot,
  patchLibraryItem,
  removeLibraryFolder,
  removeLibraryItem,
  renameLibraryFolder,
  upsertLibraryItem,
  wipeLibrary,
  type LibraryCursor,
  type LibrarySnapshot,
} from "@/lib/library-fns";
import {
  useLibraryStore,
  type Folder,
  type LibraryItem,
} from "@/lib/store";

const LEGACY_KEY = "quarto-library";
const MIGRATED_FLAG = "quarto-library-migrated-v1";

let remoteEnabled = false;

export function setLibraryRemoteEnabled(enabled: boolean) {
  remoteEnabled = enabled;
}

type OutboxEntry = { id: number; label: string; run: () => Promise<unknown> };

let outboxSeq = 0;
const outbox: OutboxEntry[] = [];
const outboxListeners = new Set<(count: number) => void>();

function notifyOutbox() {
  for (const fn of outboxListeners) fn(outbox.length);
}

/** Subscribe to the pending-sync count (offline outbox). Immediate initial call. */
export function subscribeOutbox(fn: (count: number) => void): () => void {
  outboxListeners.add(fn);
  fn(outbox.length);
  return () => {
    outboxListeners.delete(fn);
  };
}

export function pendingSyncCount(): number {
  return outbox.length;
}

function enqueue(entry: Omit<OutboxEntry, "id">) {
  outbox.push({ ...entry, id: ++outboxSeq });
  notifyOutbox();
}

function sync(label: string, task: () => Promise<unknown>) {
  if (!remoteEnabled) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    enqueue({ label, run: task });
    return;
  }
  void task().catch((err) => {
    console.error("[library]", err);
    enqueue({ label, run: task });
  });
}

/** Retry every queued mutation in order. Keeps failures queued for later. */
export async function flushSyncOutbox(): Promise<{ done: number; failed: number }> {
  let done = 0;
  const failed: OutboxEntry[] = [];
  for (const entry of outbox.splice(0)) {
    try {
      await entry.run();
      done += 1;
    } catch (err) {
      console.error("[library]", err);
      failed.push(entry);
    }
  }
  outbox.unshift(...failed);
  notifyOutbox();
  return { done, failed: failed.length };
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    void flushSyncOutbox();
  });
}

export function hydrateLibrary(snapshot: LibrarySnapshot) {
  useLibraryStore.getState().setLibrarySnapshot(
    snapshot.library,
    snapshot.folders,
    snapshot.library.length,
    true,
  );
}

function readLegacySnapshot(): LibrarySnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      state?: { library?: LibraryItem[]; folders?: Folder[] };
    };
    const library = Array.isArray(parsed.state?.library) ? parsed.state.library : [];
    const folders = Array.isArray(parsed.state?.folders) ? parsed.state.folders : [];
    if (!library.length && !folders.length) return null;
    return { library, folders };
  } catch {
    return null;
  }
}

function markLegacyMigrated() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MIGRATED_FLAG, "1");
  } catch {
    /* ignore */
  }
}

function wasLegacyMigrated(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(MIGRATED_FLAG) === "1";
  } catch {
    return true;
  }
}

export function isLibraryBootstrapped(userId: string): boolean {
  return bootedUserId === userId;
}

/** Load the signed-in user's library; one-time import from old localStorage if empty.
 *
 * Boot is paged: the first page (100 newest) unblocks first paint, then the
 * remaining pages stream in in the background. Guarded per user: every page
 * mounts its own AppGate, so without this each navigation would refetch +
 * replace the store — wiping an item that was just saved optimistically a
 * moment before its server round-trip lands.
 */
let bootedUserId: string | null = null;
let bootInflight: Promise<void> | null = null;
/** Cursor for the next background/on-demand page; null once the end is reached. */
let nextPageCursor: LibraryCursor | null | undefined;
let fillInflight: Promise<void> | null = null;
/**
 * Bumped on every boot and on sign-out. Background/on-demand page appends
 * verify it hasn't changed, so a late page can never repopulate the store
 * after sign-out or an account switch.
 */
let bootSeq = 0;

export async function bootstrapLibraryFromServer(userId: string): Promise<void> {
  if (bootedUserId === userId) return;
  if (bootInflight) {
    await bootInflight;
    return;
  }
  bootInflight = (async () => {
    bootSeq += 1;
    setLibraryRemoteEnabled(true);
    const page = await getLibrary({ data: { limit: LIBRARY_BOOT_LIMIT } });

    if ((page.total ?? 0) === 0 && page.folders.length === 0 && !wasLegacyMigrated()) {
      const legacy = readLegacySnapshot();
      if (legacy && (legacy.library.length > 0 || legacy.folders.length > 0)) {
        const snapshot = await importLibrarySnapshot({ data: legacy });
        markLegacyMigrated();
        hydrateLibrary(snapshot);
        nextPageCursor = null;
        bootedUserId = userId;
        return;
      }
      markLegacyMigrated();
    }

    const complete = page.nextCursor == null;
    useLibraryStore
      .getState()
      .setLibrarySnapshot(page.library, page.folders, page.total, complete);
    nextPageCursor = page.nextCursor;
    bootedUserId = userId;
    // Stream the rest without blocking first paint; failures surface via the
    // Load-more affordance (the cursor is preserved).
    if (page.nextCursor) void fillRemainingLibrary(userId).catch(() => undefined);
  })();
  try {
    await bootInflight;
  } finally {
    bootInflight = null;
  }
}

/** Sequentially fetch every remaining page in the background. */
async function fillRemainingLibrary(userId: string): Promise<void> {
  if (fillInflight) {
    await fillInflight;
    return;
  }
  fillInflight = (async () => {
    const seq = bootSeq;
    while (nextPageCursor) {
      // Signed out or switched account mid-fill — stop; the new boot restarts.
      if (bootedUserId !== userId || seq !== bootSeq) return;
      const page = await getLibrary({
        data: { limit: LIBRARY_BOOT_LIMIT, cursor: nextPageCursor },
      });
      if (seq !== bootSeq) return;
      useLibraryStore
        .getState()
        .appendLibraryItems(page.library, page.nextCursor == null);
      nextPageCursor = page.nextCursor;
    }
  })();
  try {
    await fillInflight;
  } catch (err) {
    console.error("[library] background fill failed:", err);
    throw err;
  } finally {
    fillInflight = null;
  }
}

/**
 * On-demand next page (powers the "Load more" button and recovers a failed
 * background fill). Returns true when further pages may exist.
 */
export async function loadMoreLibrary(): Promise<boolean> {
  const state = useLibraryStore.getState();
  if (state.libraryComplete) return false;
  const seq = bootSeq;
  let cursor = nextPageCursor;
  if (cursor === undefined) {
    const last = state.library[state.library.length - 1];
    cursor = last ? { savedAt: last.savedAt, id: last.id } : null;
  }
  const page = await getLibrary({
    data: cursor ? { limit: LIBRARY_BOOT_LIMIT, cursor } : { limit: LIBRARY_BOOT_LIMIT },
  });
  if (seq !== bootSeq) return false;
  useLibraryStore.getState().appendLibraryItems(page.library, page.nextCursor == null);
  nextPageCursor = page.nextCursor;
  return page.nextCursor != null;
}

export function syncUpsertItem(item: LibraryItem) {
  sync("save", () => upsertLibraryItem({ data: item }));
}

/**
 * Optimistic article save with server confirmation.
 *
 * Writes the item locally first (so the reader can open instantly), then
 * performs exactly one server write and reconciles the canonical server row
 * — the server can return a *different* id when it matches an existing row
 * by URL — dropping the stale optimistic row if so. The local writes skip
 * the store's fire-and-forget sync so concurrent duplicate upserts can't race
 * each other into a phantom PK conflict. On server failure a single retry is
 * queued in the outbox and the original error is rethrown — callers must
 * surface it instead of toasting a success the next refresh can't see.
 */
export async function persistArticleItem(item: LibraryItem): Promise<LibraryItem> {
  // Mirror server clamp so local optimistic rows match what the DB will keep,
  // and so a long og:image never trips the Zod max before the upsert handler.
  const prepared: LibraryItem = {
    ...item,
    title: item.title.trim().slice(0, 500) || "Untitled",
    author: item.author.slice(0, 300),
    siteName: item.siteName.slice(0, 200),
    excerpt: item.excerpt.slice(0, 4000),
    contentHtml: item.contentHtml.slice(0, 1_500_000),
    heroImage:
      item.heroImage && item.heroImage.length <= 2000 ? item.heroImage : null,
    published: item.published ? item.published.slice(0, 100) : null,
    note: item.note.slice(0, 2000),
    tags: item.tags.slice(0, 12),
    highlights: item.highlights.slice(0, 80),
  };
  const store = useLibraryStore.getState();
  store.upsertItem(prepared, { sync: false });
  let saved: LibraryItem;
  try {
    saved = await upsertLibraryItem({ data: prepared });
  } catch (err) {
    syncUpsertItem(prepared);
    throw err;
  }
  const live = useLibraryStore.getState();
  live.upsertItem(saved, { sync: false });
  if (saved.id !== prepared.id) {
    useLibraryStore.setState((s) => ({
      library: s.library.filter((row) => row.id !== prepared.id),
    }));
  }
  return saved;
}

export function syncArchiveItem(id: string, archived: boolean) {
  sync("archive", () => patchLibraryItem({ data: { id, archived } }));
}

export function syncRemoveItem(id: string) {
  sync("remove", () => removeLibraryItem({ data: { id } }));
}

export function syncPatchItem(
  id: string,
  patch: {
    favorited?: boolean;
    note?: string;
    folderId?: string | null;
    tags?: string[];
    highlights?: LibraryItem["highlights"];
  },
) {
  sync("update", () => patchLibraryItem({ data: { id, ...patch } }));
}

export function syncAddFolder(folder: Folder) {
  sync("folder", () => addLibraryFolder({ data: { id: folder.id, name: folder.name } }));
}

export function syncRenameFolder(id: string, name: string) {
  sync("folder", () => renameLibraryFolder({ data: { id, name } }));
}

export function syncRemoveFolder(id: string) {
  sync("folder", () => removeLibraryFolder({ data: { id } }));
}

/** Delete every server row for this account, then clear local state.
 *  Explicit user action — not queued; throws when unreachable. */
export async function wipeLibraryAccount(): Promise<void> {
  await wipeLibrary();
  nextPageCursor = null;
  useLibraryStore.setState({
    library: [],
    folders: [],
    openId: null,
    libraryTotal: 0,
    libraryComplete: true,
  });
}

export function clearLibraryLocal() {
  bootedUserId = null;
  nextPageCursor = undefined;
  bootSeq += 1;
  useLibraryStore.setState({
    library: [],
    folders: [],
    openId: null,
    libraryTotal: null,
    libraryComplete: false,
  });
}
