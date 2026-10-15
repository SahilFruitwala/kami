import { libraryApi, type LibraryItemPatch, type LibraryTagOp } from "@/lib/api/library";
import { LIBRARY_BOOT_LIMIT, type LibraryCursor, type LibrarySnapshot } from "@/lib/api/types";
import { useLibraryStore } from "@/lib/store";
import { clampLibraryItem, type Folder, type LibraryItem } from "@/lib/library-item";
import { createSyncQueue, localOnceFlag } from "@/lib/sync-queue";

const LEGACY_KEY = "quarto-library";
const MIGRATED_FLAG = "quarto-library-migrated-v1";

/** Library writes as data, so the outbox can be saved and replayed after a reload. */
type LibraryOp =
  | { kind: "upsert"; item: LibraryItem }
  | { kind: "patch"; id: string; patch: LibraryItemPatch }
  | { kind: "remove"; id: string }
  | { kind: "tags"; op: LibraryTagOp }
  | { kind: "folderAdd"; folder: Folder }
  | { kind: "folderRename"; id: string; name: string }
  | { kind: "folderRemove"; id: string };

function runLibraryOp(op: LibraryOp): Promise<unknown> {
  switch (op.kind) {
    case "upsert":
      return libraryApi.items.upsert(op.item);
    case "patch":
      return libraryApi.items.patch(op.id, op.patch);
    case "remove":
      return libraryApi.items.remove(op.id);
    case "tags":
      return libraryApi.tagEverywhere(op.op);
    case "folderAdd":
      return libraryApi.folders.add(op.folder);
    case "folderRename":
      return libraryApi.folders.rename(op.id, op.name);
    case "folderRemove":
      return libraryApi.folders.remove(op.id);
  }
}

const queue = createSyncQueue("library", runLibraryOp, {
  // An upsert with an empty body never clobbers the stored one, so a body is
  // the first thing to drop when localStorage is full.
  shrink: (op) => (op.kind === "upsert" ? { ...op, item: { ...op.item, contentHtml: "" } } : op),
});
const sync = queue.sync;
const legacyMigrated = localOnceFlag(MIGRATED_FLAG);

export function hydrateLibrary(snapshot: LibrarySnapshot) {
  useLibraryStore
    .getState()
    .setLibrarySnapshot(snapshot.library, snapshot.folders, snapshot.library.length, true);
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

/**
 * Paging state for the signed-in session. `bootSeq` is bumped on every boot
 * and on sign-out; page appends check it, so a late page can never
 * repopulate the store after sign-out or an account switch.
 */
let bootSeq = 0;
/** Cursor for the next background/on-demand page; null once the end is reached. */
let nextPageCursor: LibraryCursor | null | undefined;
let fillInflight: Promise<void> | null = null;

/**
 * Load the signed-in user's library (one-time import from old localStorage
 * if the account is empty). Call it through `useLibraryBoot`, which runs it
 * once per user and caches the result: re-running would replace the store
 * and drop an item saved optimistically a moment before.
 *
 * Paged: the first page (100 newest) unblocks first paint, then the rest
 * streams in the background.
 */
export async function bootstrapLibraryFromServer(userId: string): Promise<void> {
  const seq = ++bootSeq;
  queue.start(userId);
  const page = await libraryApi.page({ limit: LIBRARY_BOOT_LIMIT });
  if (seq !== bootSeq) return;

  if ((page.total ?? 0) === 0 && page.folders.length === 0 && !legacyMigrated.isSet()) {
    const legacy = readLegacySnapshot();
    if (legacy && (legacy.library.length > 0 || legacy.folders.length > 0)) {
      const snapshot = await libraryApi.import(legacy);
      legacyMigrated.set();
      if (seq !== bootSeq) return;
      hydrateLibrary(snapshot);
      nextPageCursor = null;
      return;
    }
    legacyMigrated.set();
  }

  const complete = page.nextCursor == null;
  useLibraryStore.getState().setLibrarySnapshot(page.library, page.folders, page.total, complete);
  nextPageCursor = page.nextCursor;
  // Stream the rest without blocking first paint; failures surface via the
  // Load-more affordance (the cursor is preserved).
  if (page.nextCursor) void fillRemainingLibrary().catch(() => undefined);
}

/** Sequentially fetch every remaining page in the background. */
async function fillRemainingLibrary(): Promise<void> {
  if (fillInflight) return fillInflight;
  const seq = bootSeq;
  fillInflight = (async () => {
    while (nextPageCursor && seq === bootSeq) {
      const page = await libraryApi.page({ limit: LIBRARY_BOOT_LIMIT, cursor: nextPageCursor });
      // Signed out or switched account mid-fill: stop; the new boot restarts.
      if (seq !== bootSeq) return;
      useLibraryStore.getState().appendLibraryItems(page.library, page.nextCursor == null);
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
  const page = await libraryApi.page({ limit: LIBRARY_BOOT_LIMIT, cursor });
  if (seq !== bootSeq) return false;
  useLibraryStore.getState().appendLibraryItems(page.library, page.nextCursor == null);
  nextPageCursor = page.nextCursor;
  return page.nextCursor != null;
}

export function syncUpsertItem(item: LibraryItem) {
  sync("save", { kind: "upsert", item });
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
  // Same clamp as the server, so local optimistic rows match what the DB keeps.
  const prepared = clampLibraryItem(item);
  const store = useLibraryStore.getState();
  store.upsertItem(prepared, { sync: false });
  let saved: LibraryItem;
  try {
    saved = await libraryApi.items.upsert(prepared);
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
  sync("archive", { kind: "patch", id, patch: { archived } });
}

export function syncRemoveItem(id: string) {
  sync("remove", { kind: "remove", id });
}

export function syncPatchItem(id: string, patch: LibraryItemPatch) {
  sync("update", { kind: "patch", id, patch });
}

export function syncTagEverywhere(op: LibraryTagOp) {
  sync("tags", { kind: "tags", op });
}

export function syncAddFolder(folder: Folder) {
  sync("folder", { kind: "folderAdd", folder: { id: folder.id, name: folder.name } });
}

export function syncRenameFolder(id: string, name: string) {
  sync("folder", { kind: "folderRename", id, name });
}

export function syncRemoveFolder(id: string) {
  sync("folder", { kind: "folderRemove", id });
}

/** Delete every server row for this account, then clear local state.
 *  Explicit user action — not queued; throws when unreachable. */
export async function wipeLibraryAccount(): Promise<void> {
  await libraryApi.wipe();
  // Queued writes would recreate rows the wipe just deleted.
  queue.discard();
  nextPageCursor = null;
  useLibraryStore.setState({
    library: [],
    folders: [],
    libraryTotal: 0,
    libraryComplete: true,
  });
}

export function clearLibraryLocal() {
  queue.stop();
  nextPageCursor = undefined;
  bootSeq += 1;
  useLibraryStore.setState({
    library: [],
    folders: [],
    libraryTotal: null,
    libraryComplete: false,
  });
}
