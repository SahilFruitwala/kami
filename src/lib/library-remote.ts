import {
  addLibraryFolder,
  getLibrary,
  importLibrarySnapshot,
  patchLibraryItem,
  removeLibraryFolder,
  removeLibraryItem,
  renameLibraryFolder,
  upsertLibraryItem,
  wipeLibrary,
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
  useLibraryStore.setState({
    library: snapshot.library,
    folders: snapshot.folders,
  });
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
 * Guarded per user: every page mounts its own AppGate, so without this each
 * navigation would refetch + replace the store — wiping an item that was just
 * saved optimistically a moment before its server round-trip lands.
 */
let bootedUserId: string | null = null;
let bootInflight: Promise<void> | null = null;

export async function bootstrapLibraryFromServer(userId: string): Promise<void> {
  if (bootedUserId === userId) return;
  if (bootInflight) {
    await bootInflight;
    return;
  }
  bootInflight = (async () => {
    setLibraryRemoteEnabled(true);
    let snapshot = await getLibrary();

    if (
      snapshot.library.length === 0 &&
      snapshot.folders.length === 0 &&
      !wasLegacyMigrated()
    ) {
      const legacy = readLegacySnapshot();
      if (legacy && (legacy.library.length > 0 || legacy.folders.length > 0)) {
        snapshot = await importLibrarySnapshot({ data: legacy });
        markLegacyMigrated();
      } else {
        markLegacyMigrated();
      }
    }

    hydrateLibrary(snapshot);
    bootedUserId = userId;
  })();
  try {
    await bootInflight;
  } finally {
    bootInflight = null;
  }
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
  const store = useLibraryStore.getState();
  store.upsertItem(item, { sync: false });
  let saved: LibraryItem;
  try {
    saved = await upsertLibraryItem({ data: item });
  } catch (err) {
    syncUpsertItem(item);
    throw err;
  }
  const live = useLibraryStore.getState();
  live.upsertItem(saved, { sync: false });
  if (saved.id !== item.id) {
    useLibraryStore.setState((s) => ({
      library: s.library.filter((row) => row.id !== item.id),
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
  useLibraryStore.setState({ library: [], folders: [], openId: null });
}

export function clearLibraryLocal() {
  bootedUserId = null;
  useLibraryStore.setState({ library: [], folders: [], openId: null });
}
