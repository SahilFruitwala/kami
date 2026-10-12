import { useDeferredValue, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  CheckSquare,
  Layers,
  LayoutGrid,
  LibraryBig,
  List,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { ArticleList } from "@/components/article-list.tsx";
import { LibraryAsk } from "@/components/library/library-ask.tsx";
import { LibraryFilters } from "@/components/library-filters.tsx";
import {
  GlossChip,
  GlossColumn,
  GlossEyebrow,
  GlossPage,
  GlossSearch,
  GlossStats,
  PullOut,
  Segmented,
  Shelf,
  type ShelfGroup,
} from "@/components/gloss/index.ts";
import {
  BookCover,
  BookPage,
  BookSpine,
  BookSpineFace,
  Endpaper,
  LyingBooks,
  TopicIcon,
} from "@/components/gloss/book.tsx";
import { TopicPage, TopicsGrid, type TopicBucket } from "@/components/gloss/topics.tsx";
import { useAiStatus, useAutoOrganize, useLibraryIndexer } from "@/hooks/use-ai.ts";
import { useCurrentUserState } from "@/lib/auth/use-current-user.ts";
import { minutesLabel } from "@/lib/gloss/format.ts";
import {
  countByArchive,
  filterLibraryItems,
  sortLibraryItems,
  type FolderFilter,
  type LibrarySort,
  type LibraryTab,
} from "@/lib/filter-library.ts";
import {
  bookSpineLook,
  hueOf,
  TOPIC_FAMILIES,
  TOPIC_LABELS,
  TOPIC_ORDER,
  topicOf,
  type TopicId,
} from "@/lib/gloss/palette.ts";
import { loadMoreLibrary } from "@/lib/library-remote.ts";
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

type View = "shelf" | "topics" | "list";
type Arrange = "topic" | "colour" | "recent" | "length";

const VIEW_KEY = "kami-library-view";
const ARRANGE_KEY = "kami-library-arrange";

function readPref<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = window.localStorage.getItem(key);
    return allowed.includes(v as T) ? (v as T) : fallback;
  } catch {
    return fallback;
  }
}

function writePref(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* private mode */
  }
}

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

type Picked = { id: string; kind: "spine" | "cover" };

/**
 * Library as a bookshelf (Gloss): spines grouped by topic, a Topics grid,
 * and the classic list. Clicking a spine pulls the book off the shelf, turns
 * it to its cover and opens it; "Read in Kami" dissolves into the reader.
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
  const removeItem = useLibraryStore((s) => s.removeItem);
  const archiveItem = useLibraryStore((s) => s.archiveItem);
  const setFavorited = useLibraryStore((s) => s.setFavorited);
  const setItemFolder = useLibraryStore((s) => s.setItemFolder);
  const upsertItem = useLibraryStore((s) => s.upsertItem);
  const folders = useLibraryStore((s) => s.folders);
  const { user } = useCurrentUserState();

  const counts = countByArchive(library);
  const ai = useAiStatus();
  useLibraryIndexer();
  useAutoOrganize();

  const [askOpen, setAskOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(
    () => filters.folderFilter !== "all" || filters.tagFilter != null || filters.favoritesOnly,
  );
  const [view, setViewState] = useState<View>("shelf");
  const [arrange, setArrangeState] = useState<Arrange>("topic");
  const [topic, setTopic] = useState<TopicId | "all">("all");
  const [topicPage, setTopicPage] = useState<TopicId | null>(null);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  // Per-viewer conveniences; read after mount so SSR markup stays stable.
  useEffect(() => {
    setViewState(readPref(VIEW_KEY, ["shelf", "topics", "list"] as const, "shelf"));
    setArrangeState(
      readPref(ARRANGE_KEY, ["topic", "colour", "recent", "length"] as const, "topic"),
    );
  }, []);

  function setView(next: View) {
    setViewState(next);
    writePref(VIEW_KEY, next);
    if (next !== "list") exitSelect();
  }
  function setArrange(next: Arrange) {
    setArrangeState(next);
    writePref(ARRANGE_KEY, next);
  }

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

  // Topic of every visible piece, computed once.
  const topicById = useMemo(() => {
    const m = new Map<string, TopicId>();
    for (const it of baseVisible) m.set(it.id, topicOf(it));
    return m;
  }, [baseVisible]);

  const buckets: TopicBucket[] = useMemo(() => {
    const by = new Map<TopicId, LibraryItem[]>();
    for (const it of baseVisible) {
      const t = topicById.get(it.id)!;
      const list = by.get(t);
      if (list) list.push(it);
      else by.set(t, [it]);
    }
    return TOPIC_ORDER.filter((t) => by.has(t)).map((t) => ({
      topic: t,
      items: [...by.get(t)!].sort((a, b) => b.savedAt - a.savedAt),
    }));
  }, [baseVisible, topicById]);

  // A chip for a topic that just emptied (search, archive) falls back to All.
  useEffect(() => {
    if (topic !== "all" && !buckets.some((b) => b.topic === topic)) setTopic("all");
    if (topicPage && !buckets.some((b) => b.topic === topicPage)) setTopicPage(null);
  }, [buckets, topic, topicPage]);

  const shelfGroups: ShelfGroup<LibraryItem>[] = useMemo(() => {
    const scoped =
      topic === "all" ? baseVisible : baseVisible.filter((it) => topicById.get(it.id) === topic);
    if (topic === "all" && arrange === "topic") {
      return buckets.map((b) => ({
        id: b.topic,
        items: b.items,
        label: (
          <span className="g-group-label">
            <TopicIcon topic={b.topic} className="size-3" />
            {TOPIC_LABELS[b.topic]}
            <span className="text-ink-muted tabular-nums">{b.items.length}</span>
          </span>
        ),
      }));
    }
    const sorted = [...scoped];
    if (arrange === "colour") {
      const key = (it: LibraryItem) => {
        const look = bookSpineLook(it, topicById.get(it.id)!);
        return hueOf(look.color);
      };
      sorted.sort((a, b) => key(a) - key(b));
    } else if (arrange === "length") {
      sorted.sort((a, b) => b.readingMinutes - a.readingMinutes);
    } else {
      sorted.sort((a, b) => b.savedAt - a.savedAt);
    }
    return [{ id: String(topic), items: sorted }];
  }, [baseVisible, buckets, topic, arrange, topicById]);

  const listVisible = useMemo(
    () => sortLibraryItems(baseVisible, filters.sort),
    [baseVisible, filters.sort],
  );

  const stats = useMemo(() => {
    const minutes = library.reduce((n, it) => n + (it.archived ? 0 : it.readingMinutes || 0), 0);
    const topics = new Set(library.map((it) => topicOf(it))).size;
    const inProgress = library.filter(
      (it) => !it.archived && (it.highlights?.length ?? 0) > 0,
    ).length;
    return { minutes, topics, inProgress };
  }, [library]);

  const pickedItem = picked ? (library.find((it) => it.id === picked.id) ?? null) : null;
  const pickedTopic = pickedItem ? topicOf(pickedItem) : "unsorted";

  function toggleSelect(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }
  function exitSelect() {
    setSelectMode(false);
    setSelectedIds([]);
  }
  function bulkArchive(archived: boolean) {
    for (const id of selectedIds) archiveItem(id, archived);
    toast.success(
      archived
        ? `Archived ${selectedIds.length} works`
        : `Moved ${selectedIds.length} works to inbox`,
    );
    exitSelect();
  }
  function bulkFavorite() {
    for (const id of selectedIds) setFavorited(id, true);
    toast.success(`Favorited ${selectedIds.length} works`);
    exitSelect();
  }
  function bulkDelete() {
    const snapshots = listVisible.filter((row) => selectedSet.has(row.id));
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

  const animateKey = `${filters.tab}|${topic}|${arrange}|${filters.folderFilter}|${filters.tagFilter}|${filters.favoritesOnly}`;
  const totalShown = baseVisible.length;
  const emptyCopy =
    filters.tab === "archive"
      ? "Archive a piece after you finish it. It will wait here."
      : deferredQuery
        ? `Nothing on the shelves matches “${deferredQuery}”.`
        : "Save a blog or X article and it lands on a shelf here.";

  return (
    <GlossPage>
      <GlossColumn className="pt-10 pb-6 sm:pt-14">
        <GlossEyebrow icon={<LibraryBig className="size-4" aria-hidden="true" />}>
          Personal library
        </GlossEyebrow>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <h1 className="g-h1 text-ink">Your library</h1>
          {ai.enabled ? (
            <button
              type="button"
              onClick={() => setAskOpen((v) => !v)}
              aria-expanded={askOpen}
              aria-pressed={askOpen}
              className="g-btn g-btn--ghost mb-2"
            >
              <Sparkles className="size-4" aria-hidden="true" />
              Ask your library
            </button>
          ) : null}
        </div>
        <div className="mt-4">
          <GlossStats
            parts={[
              {
                value: library.length,
                label: library.length === 1 ? "essay or paper" : "essays and papers",
              },
              { value: stats.topics, label: stats.topics === 1 ? "topic" : "topics" },
              { value: Math.max(0, Math.round(stats.minutes / 60)), label: "hours of reading" },
              { value: stats.inProgress, label: "in progress" },
              { value: counts.archived, label: "read" },
            ]}
          />
        </div>

        {askOpen && ai.enabled ? (
          <LibraryAsk semantic={ai.semanticSearch} onClose={() => setAskOpen(false)} />
        ) : null}

        {capture ? <div className="mt-8 max-w-2xl">{capture}</div> : null}

        {/* Toolbar */}
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Segmented<View>
            label="Library view"
            value={view}
            onChange={setView}
            options={[
              {
                id: "shelf",
                label: "Shelf",
                icon: <Layers className="size-4" aria-hidden="true" />,
              },
              {
                id: "topics",
                label: "Topics",
                icon: <LayoutGrid className="size-4" aria-hidden="true" />,
              },
              { id: "list", label: "List", icon: <List className="size-4" aria-hidden="true" /> },
            ]}
          />
          <GlossSearch
            id="library-search"
            value={filters.query}
            onChange={filters.onQuery}
            placeholder="Search titles, authors, notes"
            className="w-full sm:w-60"
          />
          <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
            {view === "shelf" ? (
              <>
                <span className="font-sans text-sm text-ink-muted">Arrange by</span>
                <Segmented<Arrange>
                  size="sm"
                  label="Arrange by"
                  value={arrange}
                  onChange={setArrange}
                  options={[
                    { id: "topic", label: "Topic" },
                    { id: "colour", label: "Colour" },
                    { id: "recent", label: "Recent" },
                    { id: "length", label: "Length" },
                  ]}
                />
              </>
            ) : view === "list" ? (
              <>
                <label className="sr-only" htmlFor="library-sort">
                  Sort works
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
              </>
            ) : null}
          </div>
        </div>

        {/* Inbox / archive + secondary tools */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
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
            className="g-btn g-btn--ghost h-[34px] px-3 text-[13px]"
            aria-pressed={moreOpen}
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((v) => !v)}
          >
            <SlidersHorizontal className="size-3.5" aria-hidden="true" />
            Folders &amp; tags
          </button>
          <button
            type="button"
            className="g-btn g-btn--ghost h-[34px] px-3 text-[13px]"
            aria-pressed={selectMode}
            onClick={() => {
              if (selectMode) exitSelect();
              else {
                setView("list");
                setSelectMode(true);
              }
            }}
          >
            <CheckSquare className="size-3.5" aria-hidden="true" />
            {selectMode ? "Done" : "Select"}
          </button>
          {onOpenBulk ? (
            <button
              type="button"
              className="g-btn g-btn--ghost h-[34px] px-3 text-[13px]"
              onClick={onOpenBulk}
            >
              Bulk save
            </button>
          ) : null}
        </div>

        {moreOpen ? (
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
        ) : null}

        {/* Topic chips (shelf view) */}
        {view === "shelf" && buckets.length > 0 ? (
          <div className="mt-5 flex flex-wrap gap-2" aria-label="Topics">
            <GlossChip active={topic === "all"} onClick={() => setTopic("all")} count={totalShown}>
              All
            </GlossChip>
            {buckets.map((b) => (
              <GlossChip
                key={b.topic}
                active={topic === b.topic}
                onClick={() => setTopic(topic === b.topic ? "all" : b.topic)}
                count={b.items.length}
                color={TOPIC_FAMILIES[b.topic]}
                icon={<TopicIcon topic={b.topic} className="size-3" />}
              >
                {TOPIC_LABELS[b.topic]}
              </GlossChip>
            ))}
          </div>
        ) : null}
      </GlossColumn>

      <GlossColumn className="pt-6 pb-16">
        {view === "shelf" ? (
          totalShown === 0 ? (
            <EmptyShelf copy={emptyCopy} />
          ) : (
            <>
              <Shelf<LibraryItem>
                ariaLabel="Bookshelf"
                groups={shelfGroups}
                getId={(it) => it.id}
                animateKey={animateKey}
                renderSpine={(it) => (
                  <BookSpine item={it} topic={topicById.get(it.id) ?? "unsorted"} />
                )}
                tooltip={(it) => ({
                  title: it.title,
                  sub: [it.author || it.siteName, minutesLabel(it.readingMinutes)]
                    .filter(Boolean)
                    .join(" · "),
                  label: `${it.title}${it.author ? ` by ${it.author}` : ""}, ${minutesLabel(it.readingMinutes)}`,
                })}
                onPick={(it) => setPicked({ id: it.id, kind: "spine" })}
                decoration={topic !== "all" ? <LyingBooks topic={topic} seed={topic} /> : undefined}
              />
              <p className="mt-6 font-sans text-[13px] text-ink-muted">
                Click a spine to take it down. Arrow keys walk the shelf.
              </p>
            </>
          )
        ) : view === "topics" ? (
          topicPage ? (
            <TopicPage
              topic={topicPage}
              items={buckets.find((b) => b.topic === topicPage)?.items ?? []}
              onBack={() => setTopicPage(null)}
              onPick={(it) => setPicked({ id: it.id, kind: "cover" })}
            />
          ) : (
            <TopicsGrid buckets={buckets} onOpen={setTopicPage} />
          )
        ) : (
          <>
            {selectMode ? (
              <SelectBar
                count={selectedIds.length}
                archiveLabel={filters.tab === "archive" ? "Move to inbox" : "Archive"}
                folders={folders}
                onArchive={() => bulkArchive(filters.tab !== "archive")}
                onFavorite={bulkFavorite}
                onFolder={bulkFolder}
                onDelete={bulkDelete}
                onClear={exitSelect}
              />
            ) : null}
            <div className="mt-2">
              <ArticleList
                items={listVisible}
                emptyTitle={filters.tab === "archive" ? "Nothing archived" : "Your inbox is empty"}
                emptyCopy={emptyCopy}
                onOpen={onOpenItem}
                onRemove={removeItem}
                selectMode={selectMode}
                selectedIds={selectedSet}
                onToggleSelect={toggleSelect}
              />
            </div>
          </>
        )}
        {!libraryComplete ? (
          <LoadMoreFooter loaded={library.length} total={libraryTotal} visibleCount={totalShown} />
        ) : null}
      </GlossColumn>

      {picked && pickedItem ? (
        <PullOut
          key={picked.id}
          source={picked}
          label={pickedItem.title}
          coverSize={{ w: 430, h: 620 }}
          depthRatio={
            picked.kind === "spine"
              ? (() => {
                  const l = bookSpineLook(pickedItem, pickedTopic);
                  return l.width / l.height;
                })()
              : 0.06
          }
          spineFace={<BookSpineFace item={pickedItem} topic={pickedTopic} />}
          cover={<BookCover item={pickedItem} topic={pickedTopic} />}
          inside={
            <Endpaper
              topic={pickedTopic}
              number={library.filter((r) => r.savedAt <= pickedItem.savedAt).length}
              shelvedAt={pickedItem.savedAt}
              owner={
                user?.displayName ? `${user.displayName.split(/\s+/)[0]}’s copy` : "A Kami reader"
              }
            />
          }
          page={(api) => (
            <BookPage
              api={api}
              item={pickedItem}
              topic={pickedTopic}
              onRead={() => onOpenItem(pickedItem)}
              onToggleFavorite={() => setFavorited(pickedItem.id, !pickedItem.favorited)}
              onToggleArchive={() => {
                archiveItem(pickedItem.id, !pickedItem.archived);
                toast.success(pickedItem.archived ? "Back on the shelf" : "Marked as finished");
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

function SelectBar({
  count,
  archiveLabel,
  folders,
  onArchive,
  onFavorite,
  onFolder,
  onDelete,
  onClear,
}: {
  count: number;
  archiveLabel: string;
  folders: { id: string; name: string }[];
  onArchive: () => void;
  onFavorite: () => void;
  onFolder: (folderId: string | null) => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  const btn = "g-btn g-btn--ghost h-8 px-3 text-[13px] disabled:opacity-40";
  return (
    <div
      className="sticky top-32 z-30 mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface p-2.5 shadow-[var(--g-shadow-card)] lg:top-20"
      role="toolbar"
      aria-label="Bulk actions"
    >
      <span className="px-2 font-sans text-[13px] font-medium text-ink" role="status">
        {count} selected
      </span>
      <button type="button" disabled={count === 0} onClick={onArchive} className={btn}>
        {archiveLabel}
      </button>
      <button type="button" disabled={count === 0} onClick={onFavorite} className={btn}>
        Favorite
      </button>
      <label className="sr-only" htmlFor="bulk-folder">
        File selected into folder
      </label>
      <select
        id="bulk-folder"
        disabled={count === 0}
        defaultValue=""
        onChange={(e) => {
          if (e.target.value !== "") onFolder(e.target.value === "none" ? null : e.target.value);
          e.target.value = "";
        }}
        className={cn(btn, "appearance-none")}
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
        disabled={count === 0}
        onClick={onDelete}
        className="g-btn h-8 bg-danger/10 px-3 text-[13px] text-danger hover:bg-danger/20 disabled:opacity-40"
      >
        Delete
      </button>
      <button
        type="button"
        onClick={onClear}
        className="ml-auto px-3 font-sans text-[13px] text-ink-muted underline underline-offset-2 hover:text-ink"
      >
        Clear
      </button>
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
