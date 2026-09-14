import {
  addLibraryFolder,
  getLibrary,
  importLibrarySnapshot,
  patchLibraryItem,
  removeLibraryFolder,
  removeLibraryItem,
  renameLibraryFolder,
  upsertLibraryItem,
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

function sync(task: () => Promise<unknown>) {
  if (!remoteEnabled) return;
  void task().catch((err) => {
    console.error("[library]", err);
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

/** Load the signed-in user's library; one-time import from old localStorage if empty. */
export async function bootstrapLibraryFromServer(): Promise<void> {
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
}

export function syncUpsertItem(item: LibraryItem) {
  sync(() => upsertLibraryItem({ data: item }));
}

export function syncArchiveItem(id: string, archived: boolean) {
  sync(() => patchLibraryItem({ data: { id, archived } }));
}

export function syncRemoveItem(id: string) {
  sync(() => removeLibraryItem({ data: { id } }));
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
  sync(() => patchLibraryItem({ data: { id, ...patch } }));
}

export function syncAddFolder(folder: Folder) {
  sync(() => addLibraryFolder({ data: { id: folder.id, name: folder.name } }));
}

export function syncRenameFolder(id: string, name: string) {
  sync(() => renameLibraryFolder({ data: { id, name } }));
}

export function syncRemoveFolder(id: string) {
  sync(() => removeLibraryFolder({ data: { id } }));
}

export function clearLibraryLocal() {
  useLibraryStore.setState({ library: [], folders: [], openId: null });
}
