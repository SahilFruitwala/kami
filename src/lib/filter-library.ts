import type { LibraryItem } from "@/lib/store.ts";

export type LibraryTab = "inbox" | "archive" | "vault";
export type FolderFilter = "all" | "none" | string;

export type LibraryFilterState = {
  tab: LibraryTab;
  folderFilter: FolderFilter;
  tagFilter: string | null;
  query: string;
  favoritesOnly: boolean;
};

export function filterLibraryItems(
  library: LibraryItem[],
  filters: LibraryFilterState,
): LibraryItem[] {
  const q = filters.query.trim().toLowerCase();
  return library.filter((row) => {
    if (filters.tab === "archive" && !row.archived) return false;
    if (filters.tab === "inbox" && row.archived) return false;
    if (filters.favoritesOnly && !row.favorited) return false;
    if (filters.folderFilter === "none" && row.folderId) return false;
    if (
      filters.folderFilter !== "all" &&
      filters.folderFilter !== "none" &&
      row.folderId !== filters.folderFilter
    ) {
      return false;
    }
    if (
      filters.tagFilter &&
      !(row.tags ?? []).some((tag) => tag.toLowerCase() === filters.tagFilter!.toLowerCase())
    ) {
      return false;
    }
    if (!q) return true;
    const hay = [row.title, row.author, row.siteName, row.excerpt, row.note, ...(row.tags ?? [])]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}

export function countByArchive(library: LibraryItem[]) {
  let inbox = 0;
  let archived = 0;
  for (const row of library) {
    if (row.archived) archived += 1;
    else inbox += 1;
  }
  return { inbox, archived };
}

export function collectLibraryTags(library: LibraryItem[]): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const item of library) {
    for (const tag of item.tags) {
      const key = tag.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      tags.push(tag);
    }
  }
  return tags.sort((a, b) => a.localeCompare(b));
}
