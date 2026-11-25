import { useDeferredValue, useEffect, useMemo, useState, type ReactNode } from "react";
import { Layers, LayoutGrid, LibraryBig, SlidersHorizontal } from "lucide-react";
import { CoverGrid } from "@/components/library/cover-grid.tsx";
import { toast } from "sonner";
import { LibraryFilters } from "@/components/library-filters.tsx";
import {
  GlossChip,
  GlossColumn,
  GlossEyebrow,
  GlossPage,
  GlossSearch,
  GlossStats,
  Segmented,
} from "@/components/gloss/index.ts";
import { SpineCarousel } from "@/components/gloss/spine-carousel.tsx";
import { ShelfDetail } from "@/components/gloss/shelf-detail.tsx";
import { BookCover, BookPage, BookSpineFace, TopicIcon } from "@/components/gloss/book.tsx";
import { useAutoOrganize } from "@/hooks/use-ai.ts";
import { minutesLabel } from "@/lib/gloss/format.ts";
import {
  countByArchive,
  filterLibraryItems,
  sortLibraryItems,
  type FolderFilter,
  type LibrarySort,
  type LibraryTab,
} from "@/lib/filter-library.ts";
import { topicFamily, topicLabel, topicOf, type TopicId } from "@/lib/gloss/palette.ts";
import { loadMoreLibrary } from "@/lib/library-remote.ts";
import type { LibraryItem } from "@/lib/library-item.ts";
import { useLibraryStore } from "@/lib/store.ts";
import { usePersistedPref } from "@/lib/local-pref.ts";
import { stampToast } from "@/components/gloss/stamp-toast.tsx";
import {
  arrangeShelf,
  groupByTopic,
  libraryStats,
  type ShelfArrange,
} from "@/lib/library-shelves.ts";

const SORT_LABELS: { id: LibrarySort; label: string }[] = [
  { id: "newest", label: "Newest" },
  { id: "oldest", label: "Oldest" },
  { id: "longest", label: "Longest read" },
  { id: "shortest", label: "Quick reads" },
  { id: "title", label: "Title A–Z" },
];

const VIEWS = ["covers", "shelf"] as const;
const ARRANGES = ["topic", "colour", "recent", "length"] as const satisfies readonly ShelfArrange[];
type View = (typeof VIEWS)[number];
type Arrange = (typeof ARRANGES)[number];

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

type Picked = { id: string; from: DOMRect };

/**
 * Library as a bookshelf (Gloss): a cover grid, and a rail of spines where the
 * middle book turns to face you. Choosing the middle book opens it from its
 * cover; "Read in Kami" dissolves into the reader.
 */
export function LibraryHome({
  filters,
  capture,
  onOpenItem,
  onOpenBulk,
}: {
  filters: ShelfFilters;
  /** Optional capture form (paste a link without leaving the library). */
  capture?: ReactNode;
  onOpenItem: (item: LibraryItem) => void;
  onOpenBulk?: () => void;
}) {
  const deferredQuery = useDeferredValue(filters.query);
  const library = useLibraryStore((s) => s.library);
  const libraryTotal = useLibraryStore((s) => s.libraryTotal);
  const libraryComplete = useLibraryStore((s) => s.libraryComplete);
  const archiveItem = useLibraryStore((s) => s.archiveItem);
  const setFavorited = useLibraryStore((s) => s.setFavorited);

  const counts = countByArchive(library);
  useAutoOrganize();

  const activeFilters =
    (filters.folderFilter !== "all" ? 1 : 0) +
    (filters.tagFilter != null ? 1 : 0) +
    (filters.favoritesOnly ? 1 : 0);
  const [moreOpen, setMoreOpen] = useState(
    () => filters.folderFilter !== "all" || filters.tagFilter != null || filters.favoritesOnly,
  );
  const [view, setViewState] = usePersistedPref<View>("kami-library-view-v2", VIEWS, "covers");
  const [arrange, setArrange] = usePersistedPref<Arrange>(
    "kami-library-arrange",
    ARRANGES,
    "topic",
  );
  const [topic, setTopic] = useState<TopicId | "all">("all");
  const [picked, setPicked] = useState<Picked | null>(null);

  const baseVisible = useMemo(
    () =>
      filterLibraryItems(library, {
        tab: filters.tab,
        folderFilter: filters.folderFilter,
        tagFilter: filters.tagFilter,
        query: deferredQuery,
        favoritesOnly: filters.favoritesOnly,
      }),
    [
      library,
      filters.tab,
      filters.folderFilter,
      filters.tagFilter,
      deferredQuery,
      filters.favoritesOnly,
    ],
  );

  const { topicById, buckets } = useMemo(() => groupByTopic(baseVisible), [baseVisible]);

  // A chip for a topic that just emptied (search, archive) falls back to All.
  useEffect(() => {
    if (topic !== "all" && !buckets.some((b) => b.topic === topic)) setTopic("all");
  }, [buckets, topic]);

  const shelfItems = useMemo(() => {
    if (topic === "all" && arrange === "topic") return buckets.flatMap((b) => b.items);
    const scoped =
      topic === "all" ? baseVisible : baseVisible.filter((it) => topicById.get(it.id) === topic);
    return arrangeShelf(scoped, arrange, topicById);
  }, [baseVisible, buckets, topic, arrange, topicById]);

  const coverItems = useMemo(
    () =>
      sortLibraryItems(
        topic === "all" ? baseVisible : baseVisible.filter((it) => topicById.get(it.id) === topic),
        filters.sort,
      ),
    [baseVisible, topic, topicById, filters.sort],
  );

  const stats = useMemo(() => libraryStats(library), [library]);

  const pickedItem = picked ? (library.find((it) => it.id === picked.id) ?? null) : null;
  const pickedTopic = pickedItem ? topicOf(pickedItem) : "unsorted";

  const shelfKey = `${filters.tab}|${topic}|${arrange}|${filters.folderFilter}|${filters.tagFilter}|${filters.favoritesOnly}|${deferredQuery}`;
  const totalShown = baseVisible.length;
  const emptyCopy =
    filters.tab === "archive"
      ? "Finish something and it gets stamped and filed here."
      : deferredQuery
        ? `Nothing on the shelves matches “${deferredQuery}”.`
        : "Nothing waiting. Save a blog or X article and it lands on a shelf here.";

  return (
    <GlossPage>
      <GlossColumn className="pt-10 pb-6 sm:pt-14">
        <GlossEyebrow icon={<LibraryBig className="size-4" aria-hidden="true" />}>
          Personal library
        </GlossEyebrow>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <h1 className="g-h1 text-ink">Your library</h1>
        </div>
        <div className="mt-4">
          <GlossStats
            parts={[
              {
                value: library.length,
                label: library.length === 1 ? "essay or paper" : "essays and papers",
              },
              { value: stats.topics, label: stats.topics === 1 ? "tag" : "tags" },
              { value: Math.max(0, Math.round(stats.minutes / 60)), label: "hours of reading" },
              { value: stats.inProgress, label: "in progress" },
              { value: counts.archived, label: "read" },
            ]}
          />
        </div>

        {capture ? <div className="mt-8 max-w-2xl">{capture}</div> : null}

        {/* Toolbar: one row. Arrange, sort, filters, select and bulk save live behind Options. */}
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Segmented<View>
            label="Library view"
            value={view}
            onChange={setViewState}
            options={[
              {
                id: "covers",
                label: "Covers",
                icon: <LayoutGrid className="size-4" aria-hidden="true" />,
              },
              {
                id: "shelf",
                label: "Shelf",
                icon: <Layers className="size-4" aria-hidden="true" />,
              },
            ]}
          />
          <GlossSearch
            id="library-search"
            value={filters.query}
            onChange={filters.onQuery}
            placeholder="Search titles, authors, notes"
            className="w-full sm:w-72"
          />
          <Segmented<LibraryTab>
            size="sm"
            label="Inbox or archive"
            value={filters.tab}
            onChange={filters.onTab}
            options={[
              { id: "inbox", label: `On the shelf ${counts.inbox}` },
              { id: "archive", label: `Finished ${counts.archived}` },
            ]}
          />
          <button
            type="button"
            className="g-btn g-btn--ghost ml-auto h-10 px-4"
            aria-pressed={moreOpen}
            aria-expanded={moreOpen}
            aria-controls="library-options"
            onClick={() => setMoreOpen((v) => !v)}
          >
            <SlidersHorizontal className="size-4" aria-hidden="true" />
            Options
            {activeFilters > 0 ? (
              <span className="flex size-5 items-center justify-center rounded-full bg-persimmon text-[11px] font-semibold text-white">
                {activeFilters}
              </span>
            ) : null}
          </button>
        </div>

        {moreOpen ? (
          <div id="library-options" className="kami-sheet g-rise mt-4 grid gap-6 p-5 sm:p-6">
            <div className="flex flex-wrap items-start gap-x-10 gap-y-5">
              {view === "shelf" ? (
                <div className="grid gap-2">
                  <span className="font-sans text-sm text-ink-muted">Arrange by</span>
                  <Segmented<Arrange>
                    size="sm"
                    label="Arrange by"
                    value={arrange}
                    onChange={setArrange}
                    options={[
                      { id: "topic", label: "Tag" },
                      { id: "colour", label: "Colour" },
                      { id: "recent", label: "Recent" },
                      { id: "length", label: "Length" },
                    ]}
                  />
                </div>
              ) : view === "covers" ? (
                <div className="grid gap-2">
                  <label className="font-sans text-sm text-ink-muted" htmlFor="library-sort">
                    Sort by
                  </label>
                  <select
                    id="library-sort"
                    value={filters.sort}
                    onChange={(e) => filters.onSort(e.target.value as LibrarySort)}
                    className="g-btn g-btn--ghost h-9 appearance-none pr-4"
                  >
                    {SORT_LABELS.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              <div className="grid gap-2">
                <span className="font-sans text-sm text-ink-muted">Actions</span>
                <div className="flex flex-wrap gap-2">
                  {onOpenBulk ? (
                    <button
                      type="button"
                      className="g-btn g-btn--ghost h-9 px-3 text-[13px]"
                      onClick={onOpenBulk}
                    >
                      Bulk save
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="grid gap-2">
              <span className="font-sans text-sm text-ink-muted">Filter by</span>
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
        ) : null}

        {/* Topic chips (shelf view) */}
        {(view === "shelf" || view === "covers") && buckets.length > 0 ? (
          <div className="mt-5 flex flex-wrap gap-2" aria-label="Tags">
            <GlossChip active={topic === "all"} onClick={() => setTopic("all")} count={totalShown}>
              All
            </GlossChip>
            {buckets.map((b) => (
              <GlossChip
                key={b.topic}
                active={topic === b.topic}
                onClick={() => setTopic(topic === b.topic ? "all" : b.topic)}
                count={b.items.length}
                color={topicFamily(b.topic)}
                icon={<TopicIcon topic={b.topic} className="size-3" />}
              >
                {topicLabel(b.topic, b.items[0]?.tags)}
              </GlossChip>
            ))}
          </div>
        ) : null}
      </GlossColumn>

      <GlossColumn className="pt-6 pb-16">
        {view === "covers" ? (
          coverItems.length === 0 ? (
            <EmptyShelf copy={emptyCopy} />
          ) : (
            <CoverGrid items={coverItems} onOpen={onOpenItem} />
          )
        ) : totalShown === 0 ? (
          <EmptyShelf copy={emptyCopy} />
        ) : (
          <>
            <SpineCarousel<LibraryItem>
              key={shelfKey}
              items={shelfItems}
              getId={(it) => it.id}
              ariaLabel="Bookshelf"
              renderSpine={(it) => (
                <BookSpineFace item={it} topic={topicById.get(it.id) ?? "unsorted"} />
              )}
              renderCover={(it) => (
                <BookCover item={it} topic={topicById.get(it.id) ?? "unsorted"} />
              )}
              caption={(it) =>
                [it.title, it.author || it.siteName, minutesLabel(it.readingMinutes)]
                  .filter(Boolean)
                  .join(" · ")
              }
              onOpen={(it, from) => setPicked({ id: it.id, from })}
            />
            <p className="mt-4 text-center font-sans text-[13px] text-ink-muted">
              Swipe or use the arrow keys to walk the shelf, click the middle book to open it.
            </p>
          </>
        )}
        {!libraryComplete ? (
          <LoadMoreFooter loaded={library.length} total={libraryTotal} visibleCount={totalShown} />
        ) : null}
      </GlossColumn>

      {picked && pickedItem ? (
        <ShelfDetail
          key={picked.id}
          from={picked.from}
          label={pickedItem.title}
          cover={<BookCover item={pickedItem} topic={pickedTopic} />}
          page={(api) => (
            <BookPage
              api={api}
              item={pickedItem}
              topic={pickedTopic}
              onRead={() => onOpenItem(pickedItem)}
              onToggleFavorite={() => {
                setFavorited(pickedItem.id, !pickedItem.favorited);
                if (!pickedItem.favorited) stampToast("loved");
              }}
              onToggleArchive={() => {
                archiveItem(pickedItem.id, !pickedItem.archived);
                if (pickedItem.archived) toast.success("Back on the shelf");
                else stampToast("finished");
              }}
            />
          )}
          onClosed={() => setPicked(null)}
        />
      ) : null}
    </GlossPage>
  );
}

function EmptyShelf({ copy }: { copy: string }) {
  return (
    <div className="flex flex-col items-center py-10 text-center">
      <div className="g-shelf w-full max-w-xl" style={{ ["--line-h" as string]: "120px" }}>
        <div className="g-slot">
          <span className="g-bookend" aria-hidden="true" />
        </div>
      </div>
      <p className="mt-8 font-display text-2xl italic text-ink-soft">An empty shelf</p>
      <p className="mt-2 max-w-sm font-sans text-sm text-ink-muted">{copy}</p>
    </div>
  );
}

function LoadMoreFooter({
  loaded,
  total,
  visibleCount,
}: {
  loaded: number;
  total: number | null;
  visibleCount: number;
}) {
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  async function handleLoadMore() {
    if (loading) return;
    setLoading(true);
    setFailed(false);
    try {
      await loadMoreLibrary();
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-10 flex flex-col items-center gap-2 text-center">
      <p className="font-sans text-[13px] text-ink-muted" role="status">
        Showing {visibleCount} of {total ?? loaded} works
        {loading ? " — loading more…" : " — older works are still arriving"}
      </p>
      <button
        type="button"
        onClick={() => void handleLoadMore()}
        disabled={loading}
        className="g-btn g-btn--ghost disabled:opacity-60"
      >
        {loading ? "Loading…" : failed ? "Try again" : "Load more"}
      </button>
    </div>
  );
}
