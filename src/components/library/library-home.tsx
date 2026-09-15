import { useDeferredValue, useMemo, useState, ViewTransition } from "react";
import { Search } from "lucide-react";
import { ArticleList } from "@/components/article-list.tsx";
import { LibraryTabs } from "@/components/library/library-tabs.tsx";
import { LibraryFilters } from "@/components/library-filters.tsx";
import { KamiEyebrow } from "@/components/kami.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
  countByArchive,
  filterLibraryItems,
  type FolderFilter,
  type LibraryTab,
} from "@/lib/filter-library.ts";
import type { LibraryItem } from "@/lib/store.ts";
import { useLibraryStore } from "@/lib/store.ts";

type ShelfFilters = {
  tab: LibraryTab;
  folderFilter: FolderFilter;
  tagFilter: string | null;
  query: string;
  favoritesOnly: boolean;
  onTab: (tab: LibraryTab) => void;
  onFolder: (value: FolderFilter) => void;
  onTag: (tag: string | null) => void;
  onQuery: (value: string) => void;
  onFavoritesOnly: (value: boolean) => void;
};

/** Library shelf: ink search, inbox/archive tabs, filters, and the scroll grid. */
export function LibraryHome({
  filters,
  onOpenItem,
}: {
  filters: ShelfFilters;
  onOpenItem: (item: LibraryItem) => void;
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
  const visible = useMemo(
    () =>
      baseVisible.filter((row) => {
        if (shortOnly && row.readingMinutes >= 10) return false;
        if (inProgressOnly && !(row.highlights?.length > 0)) return false;
        return true;
      }),
    [baseVisible, shortOnly, inProgressOnly],
  );

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
              <div className="kami-sheet flex items-center px-3 py-2.5">
                <Search className="mr-2 size-[18px] shrink-0 text-ink-muted" aria-hidden="true" />
                <label htmlFor="library-search" className="sr-only">
                  Search washi, authors, or concepts
                </label>
                <Input
                  id="library-search"
                  name="q"
                  type="search"
                  autoComplete="off"
                  value={filters.query}
                  onChange={(e) => filters.onQuery(e.target.value)}
                  placeholder="Search washi, authors, or concepts…"
                  className="h-auto flex-1 border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
                />
                <kbd className="hidden shrink-0 rounded-[0.25rem] bg-paper-warm px-1.5 py-0.5 font-sans text-[11px] text-ink-muted sm:inline-block">
                  ⌘K
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
