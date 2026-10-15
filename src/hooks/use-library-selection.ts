import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { LibraryItem } from "@/lib/library-item";
import { useLibraryStore } from "@/lib/store";

/** Multi-select on the library list plus the bulk actions its bar offers. */
export function useLibrarySelection() {
  const archiveItem = useLibraryStore((s) => s.archiveItem);
  const setFavorited = useLibraryStore((s) => s.setFavorited);
  const setItemFolder = useLibraryStore((s) => s.setItemFolder);
  const removeItem = useLibraryStore((s) => s.removeItem);
  const upsertItem = useLibraryStore((s) => s.upsertItem);
  const [active, setActive] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  function toggle(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }
  function exit() {
    setActive(false);
    setSelectedIds([]);
  }
  function archive(archived: boolean) {
    for (const id of selectedIds) archiveItem(id, archived);
    toast.success(
      archived
        ? `Archived ${selectedIds.length} works`
        : `Moved ${selectedIds.length} works to inbox`,
    );
    exit();
  }
  function favorite() {
    for (const id of selectedIds) setFavorited(id, true);
    toast.success(`Favorited ${selectedIds.length} works`);
    exit();
  }
  /** Remove the selected rows of `visible`, with an Undo that restores them. */
  function remove(visible: readonly LibraryItem[]) {
    const snapshots = visible.filter((row) => selectedSet.has(row.id));
    for (const row of snapshots) removeItem(row.id);
    exit();
    toast.success(`Removed ${snapshots.length} works`, {
      action: { label: "Undo", onClick: () => snapshots.forEach((row) => upsertItem(row)) },
    });
  }
  function file(folderId: string | null) {
    for (const id of selectedIds) setItemFolder(id, folderId);
    toast.success(`Filed ${selectedIds.length} works`);
    exit();
  }

  return {
    active,
    start: () => setActive(true),
    selectedIds,
    selectedSet,
    setSelectedIds,
    toggle,
    exit,
    archive,
    favorite,
    remove,
    file,
  };
}
