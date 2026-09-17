import { useDeferredValue, useMemo, useState, ViewTransition } from "react";
import { CheckSquare, Search } from "lucide-react";
import { toast } from "sonner";
import { ArticleList } from "@/components/article-list.tsx";
import { LibraryTabs } from "@/components/library/library-tabs.tsx";
import { LibraryFilters } from "@/components/library-filters.tsx";
import { KamiEyebrow } from "@/components/kami.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
  countByArchive,
  filterLibraryItems,
  sortLibraryItems,
  type FolderFilter,
  type LibrarySort,
  type LibraryTab,
} from "@/lib/filter-library.ts";
import type { LibraryItem } from "@/lib/store.ts";
import { useLibraryStore } from "@/lib/store.ts";
import { cn } from "@/lib/utils.ts";

const SORT_LABELS: { id: LibrarySort; label: string }[] = [
  { id: "newest", label: "Newest" },
  { id: "oldest", label: "Oldest" },
  { id: "longest", label: "Longest read" },
  { id: "shortest", label: "Quick reads" },
  { id: "title", label: "Title A–Z" },
];

type ShelfFilters = {
  tab: LibraryTab;
  folderFilter: FolderFilter;
  tagFilter: string | null;
  query: string;
  favoritesOnly: boolean;
  sort: LibrarySort;
  onTab: (tab: LibraryTab) => void;
  onFolder: (value: FolderFilter) => void;
  onTag: (tag: string | null) => void;
  onQuery: (value: string) => void;
  onFavoritesOnly: (value: boolean) => void;
  onSort: (sort: LibrarySort) => void;
};

/** Library shelf: ink search, inbox/archive tabs, filters, and the scroll grid. */
export function LibraryHome({
  filters,
  onOpenItem,
  onOpenBulk,
}: {
  filters: ShelfFilters;
  onOpenItem: (item: LibraryItem) => void;
  onOpenBulk?: () => void;
}) {
  const deferredQuery = useDeferredValue(filters.query);
  const library = useLibraryStore((s) => s.library);
  const removeItem = useLibraryStore((s) => s.removeItem);

  const counts = countByArchive(library);

  const baseVisible = filterLibraryItems(library, {
    tab: filters.tab,
    folderFilter: filters.folderFilter,
    tagFilter: filters.tagFilter,
    query: deferredQuery,
    favoritesOnly: filters.favoritesOnly,
  });

  const [shortOnly, setShortOnly] = useState(false);
  const [inProgressOnly, setInProgressOnly] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const archiveItem = useLibraryStore((s) => s.archiveItem);
  const setFavorited = useLibraryStore((s) => s.setFavorited);
  const setItemFolder = useLibraryStore((s) => s.setItemFolder);
  const upsertItem = useLibraryStore((s) => s.upsertItem);
  const folders = useLibraryStore((s) => s.folders);

  const visible = useMemo(
    () =>
      sortLibraryItems(
        baseVisible.filter((row) => {
          if (shortOnly && row.readingMinutes >= 10) return false;
          if (inProgressOnly && !(row.highlights?.length > 0)) return false;
          return true;
        }),
        filters.sort,
      ),
    [baseVisible, shortOnly, inProgressOnly, filters.sort],
  );

  function toggleSelect(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function exitSelect() {
    setSelectMode(false);
    setSelectedIds([]);
  }

  function bulkArchive(archived: boolean) {
    for (const id of selectedIds) archiveItem(id, archived);
    toast.success(archived ? `Archived ${selectedIds.length} works` : `Moved ${selectedIds.length} works to inbox`);
    exitSelect();
  }

  function bulkFavorite() {
    for (const id of selectedIds) setFavorited(id, true);
    toast.success(`Favorited ${selectedIds.length} works`);
    exitSelect();
  }

  function bulkDelete() {
    const snapshots = visible.filter((row) => selectedSet.has(row.id));
    for (const row of snapshots) removeItem(row.id);
    const n = snapshots.length;
    exitSelect();
    toast.success(`Removed ${n} works`, {
      action: { label: "Undo", onClick: () => snapshots.forEach((row) => upsertItem(row)) },
    });
  }

  function bulkFolder(folderId: string | null) {
    for (const id of selectedIds) setItemFolder(id, folderId);
    toast.success(`Filed ${selectedIds.length} works`);
    exitSelect();
  }

  return (
    <>
      <section className="w-full bg-paper/60 backdrop-blur-sm">
        <div className="mx-auto w-full max-w-7xl px-4 pt-8 pb-6 sm:px-6 lg:px-12">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div>
              <KamiEyebrow>
                Bunko Desk
                <span className="size-1 rounded-full bg-hanko/40" aria-hidden="true" />
                <span className="text-bamboo">Vol. {counts.inbox + counts.archived} bound</span>
              </KamiEyebrow>
              <h2 className="mt-2 flex flex-wrap items-center gap-3 font-display text-3xl tracking-tight text-ink">
                Library
                <span className="rounded-full bg-bamboo-wash px-2 py-0.5 font-sans text-[11px] font-medium text-bamboo">
                  {counts.inbox + counts.archived} Works Bound
                </span>
              </h2>
            </div>
            <div className="relative w-full md:w-80">
              <div className="kami-sheet flex items-center px-3 py-2.5 focus-within:ring-2 focus-within:ring-hanko/40">
                <Search className="mr-2 size-[18px] shrink-0 text-ink-muted" aria-hidden="true" />
                <label htmlFor="library-search" className="sr-only">
                  Search washi, authors, or concepts
                </label>
                <Input
                  id="library-search"
                  name="q"
                  type="search"
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  value={filters.query}
                  onChange={(e) => filters.onQuery(e.target.value)}
                  placeholder="Search washi, authors, or concepts…"
                  className="h-auto flex-1 border-0 bg-transparent p-0 shadow-none focus-visible:ring-2 focus-visible:ring-hanko/40"
                />
                <kbd className="hidden shrink-0 rounded-[0.25rem] bg-paper-warm px-1.5 py-0.5 font-sans text-[11px] text-ink-muted tabular-nums sm:inline-block">
                  ⌘&nbsp;K
                </kbd>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <LibraryTabs
              tab={filters.tab}
              inboxCount={counts.inbox}
              archiveCount={counts.archived}
              onTab={filters.onTab}
            />
            <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
              <StatusChip active={shortOnly} onClick={() => setShortOnly((v) => !v)} dot="bg-ok">
                &lt; 10 min
              </StatusChip>
              <StatusChip
                active={inProgressOnly}
                onClick={() => setInProgressOnly((v) => !v)}
                dot="bg-hanko"
              >
                In Progress
              </StatusChip>
              <label className="sr-only" htmlFor="library-sort">
                Sort works
              </label>
              <select
                id="library-sort"
                value={filters.sort}
                onChange={(e) => filters.onSort(e.target.value as LibrarySort)}
                className="h-8 shrink-0 rounded-[0.25rem] bg-surface px-2 font-sans text-xs font-medium text-ink-soft shadow-[var(--shadow-border)] outline-none focus-visible:ring-2 focus-visible:ring-hanko/40"
              >
                {SORT_LABELS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}
                aria-pressed={selectMode}
                className={cn(
                  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[0.25rem] px-3 font-sans text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hanko/40",
                  selectMode
                    ? "bg-hanko font-semibold text-white shadow-sm"
                    : "bg-surface text-ink-soft shadow-[var(--shadow-border)] hover:text-ink",
                )}
              >
                <CheckSquare className="size-3.5" aria-hidden="true" />
                {selectMode ? "Done" : "Select"}
              </button>
              {onOpenBulk ? (
                <button
                  type="button"
                  onClick={onOpenBulk}
                  className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[0.25rem] bg-surface px-3 font-sans text-xs font-medium text-ink-soft shadow-[var(--shadow-border)] transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hanko/40"
                >
                  Bulk save
                </button>
              ) : null}
            </div>
          </div>

          <div className="mt-4">
            <LibraryFilters
              folderFilter={filters.folderFilter}
              tagFilter={filters.tagFilter}
              favoritesOnly={filters.favoritesOnly}
              onFolder={filters.onFolder}
              onTag={filters.onTag}
              onFavoritesOnly={filters.onFavoritesOnly}
            />
          </div>
        </div>
      </section>

      <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-12">
        <div className="flex items-center justify-between pt-2">
          <p className="flex items-baseline gap-2">
            <span className="font-display text-xl text-ink">Curated Scrolls</span>
            <span className="font-sans text-xs text-ink-muted">
              / Selected for Thoughtful Reflection
            </span>
          </p>
        </div>

        {selectMode ? (
          <div
            className="kami-sheet sticky top-32 z-30 mt-4 flex flex-wrap items-center gap-2 p-3 lg:top-20"
            role="toolbar"
            aria-label="Bulk actions"
          >
            <span className="px-1 font-sans text-xs font-semibold text-ink" role="status">
              {selectedIds.length} selected
            </span>
            <button
              type="button"
              disabled={selectedIds.length === 0}
              onClick={() => bulkArchive(filters.tab !== "archive")}
              className="rounded-[0.25rem] bg-paper-warm px-3 py-1.5 font-sans text-xs font-medium text-ink disabled:opacity-40 hover:bg-line"
            >
              {filters.tab === "archive" ? "Move to inbox" : "Archive"}
            </button>
            <button
              type="button"
              disabled={selectedIds.length === 0}
              onClick={bulkFavorite}
              className="rounded-[0.25rem] bg-paper-warm px-3 py-1.5 font-sans text-xs font-medium text-ink disabled:opacity-40 hover:bg-line"
            >
              Favorite
            </button>
            <label className="sr-only" htmlFor="bulk-folder">
              File selected into folder
            </label>
            <select
              id="bulk-folder"
              disabled={selectedIds.length === 0}
              defaultValue=""
              onChange={(e) => {
                if (e.target.value !== "") bulkFolder(e.target.value === "none" ? null : e.target.value);
                e.target.value = "";
              }}
              className="h-8 rounded-[0.25rem] bg-paper-warm px-2 font-sans text-xs font-medium text-ink disabled:opacity-40"
            >
              <option value="" disabled>
                File into…
              </option>
              <option value="none">Unfiled</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={selectedIds.length === 0}
              onClick={bulkDelete}
              className="rounded-[0.25rem] bg-danger/10 px-3 py-1.5 font-sans text-xs font-medium text-danger disabled:opacity-40 hover:bg-danger/20"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={exitSelect}
              className="ml-auto rounded-[0.25rem] px-3 py-1.5 font-sans text-xs text-ink-muted underline underline-offset-2 hover:text-ink"
            >
              Clear
            </button>
          </div>
        ) : null}

        <ViewTransition key={filters.tab} enter="fade-in" exit="fade-out" default="none">
          <div className="mt-6">
            <ArticleList
              items={visible}
              emptyTitle={filters.tab === "archive" ? "Nothing archived" : "Your inbox is empty"}
              emptyCopy={
                filters.tab === "archive"
                  ? "Archive a piece after you finish it. It will wait here."
                  : "Save a blog or X article from Home for later."
              }
              onOpen={onOpenItem}
              onRemove={removeItem}
              selectMode={selectMode}
              selectedIds={selectedSet}
              onToggleSelect={toggleSelect}
            />
          </div>
        </ViewTransition>
      </div>
    </>
  );
}

function StatusChip({
  active,
  onClick,
  dot,
  children,
}: {
  active: boolean;
  onClick: () => void;
  dot: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        active
          ? "inline-flex items-center gap-1.5 rounded-[0.25rem] bg-paper-warm px-3 py-1 font-sans text-xs font-semibold text-ink"
          : "inline-flex items-center gap-1.5 rounded-[0.25rem] bg-surface px-3 py-1 font-sans text-xs text-ink-soft transition-colors hover:bg-paper-warm"
      }
    >
      <span className={`size-1.5 rounded-full ${dot}`} aria-hidden="true" />
      {children}
    </button>
  );
}
