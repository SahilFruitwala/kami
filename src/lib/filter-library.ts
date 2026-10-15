import type { LibraryItem } from "@/lib/library-item.ts";

export type LibraryTab = "inbox" | "archive";
export type FolderFilter = "all" | "none" | string;
export type LibrarySort = "newest" | "oldest" | "longest" | "shortest" | "title";

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
    if (filters.tab === "archive" ? !row.archived : row.archived) return false;
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
    const hay = [
      row.title,
      row.author,
      row.siteName,
      row.excerpt,
      row.note,
      ...(row.tags ?? []),
      ...(row.highlights ?? []).flatMap((h) => [h.text, h.note]),
    ]
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

const SORT_FNS: Record<LibrarySort, (a: LibraryItem, b: LibraryItem) => number> = {
  newest: (a, b) => b.savedAt - a.savedAt,
  oldest: (a, b) => a.savedAt - b.savedAt,
  longest: (a, b) => b.readingMinutes - a.readingMinutes,
  shortest: (a, b) => a.readingMinutes - b.readingMinutes,
  title: (a, b) => a.title.localeCompare(b.title),
};

export function sortLibraryItems(items: LibraryItem[], sort: LibrarySort): LibraryItem[] {
  return [...items].sort(SORT_FNS[sort] ?? SORT_FNS.newest);
}

export function isLibrarySort(value: unknown): value is LibrarySort {
  return (
    value === "newest" ||
    value === "oldest" ||
    value === "longest" ||
    value === "shortest" ||
    value === "title"
  );
}

/**
 * The article after `id` in the reading queue (unarchived, newest saved
 * first; ties keep library order), wrapping to the newest. Null when `id`
 * isn't in the queue. Linear, so it is cheap enough to run as a store selector.
 */
export function nextInQueue<T extends { id: string; savedAt: number; archived: boolean }>(
  library: readonly T[],
  id: string,
): T | null {
  const at = library.findIndex((row) => row.id === id);
  const current = library[at];
  if (!current || current.archived) return null;
  // Sorted position: savedAt descending, then library index ascending.
  const before = (a: T, ai: number, b: T, bi: number) =>
    a.savedAt > b.savedAt || (a.savedAt === b.savedAt && ai < bi);
  let next: T | null = null;
  let nextIdx = -1;
  let first: T | null = null;
  let firstIdx = -1;
  library.forEach((row, i) => {
    if (row.archived) return;
    if (!first || before(row, i, first, firstIdx)) {
      first = row;
      firstIdx = i;
    }
    if (before(current, at, row, i) && (!next || before(row, i, next, nextIdx))) {
      next = row;
      nextIdx = i;
    }
  });
  return next ?? first;
}
