import { useDeferredValue, useEffect, useMemo, useRef, useState, ViewTransition } from "react";
import { BookOpen, Clock3, Highlighter, PenLine, Search } from "lucide-react";
import { ArticleList } from "@/components/article-list.tsx";
import { CaptureForm } from "@/components/library/capture-form.tsx";
import { LibraryHeader } from "@/components/library/library-header.tsx";
import { PasteDialog, ToolsDialog } from "@/components/library/library-dialogs.tsx";
import { LibraryTabs } from "@/components/library/library-tabs.tsx";
import { LibraryFilters } from "@/components/library-filters.tsx";
import { VaultView } from "@/components/library/vault-view.tsx";
import { Hanko, KamiEyebrow, RhythmBars, WashiTag } from "@/components/kami.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
  countByArchive,
  filterLibraryItems,
  type FolderFilter,
  type LibraryTab,
} from "@/lib/filter-library.ts";
import type { LibraryItem } from "@/lib/store.ts";
import { useLibraryStore } from "@/lib/store.ts";

type LibraryHomeProps = {
  url: string;
  busy: boolean;
  error: string;
  savingWithoutOpen: boolean;
  bookmarklet: string;
  toolsOpen: boolean;
  onToolsOpenChange: (open: boolean) => void;
  onUrlChange: (value: string) => void;
  onClearError: () => void;
  onSave: (url?: string) => void;
  onSaveLinkOnly: () => void;
  filters: {
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
  paste: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    body: string;
    url: string;
    busy: boolean;
    onTitle: (value: string) => void;
    onBody: (value: string) => void;
    onUrl: (value: string) => void;
    onImport: () => void;
    onOpenPaste: (seedUrl?: string) => void;
  };
  onOpenItem: (item: LibraryItem) => void;
};

export function LibraryHome({
  url,
  busy,
  error,
  savingWithoutOpen,
  bookmarklet,
  toolsOpen,
  onToolsOpenChange,
  onUrlChange,
  onClearError,
  onSave,
  onSaveLinkOnly,
  filters,
  paste,
  onOpenItem,
}: LibraryHomeProps) {
  const deferredQuery = useDeferredValue(filters.query);
  const library = useLibraryStore((s) => s.library);
  const folders = useLibraryStore((s) => s.folders);
  const removeItem = useLibraryStore((s) => s.removeItem);
  const searchRef = useRef<HTMLInputElement>(null);

  const counts = countByArchive(library);
  const vaultCount = useMemo(
    () => library.reduce((n, row) => n + (row.highlights?.length ?? 0), 0),
    [library],
  );

  const baseVisible = filterLibraryItems(library, {
    tab: filters.tab,
    folderFilter: filters.folderFilter,
    tagFilter: filters.tagFilter,
    query: deferredQuery,
    favoritesOnly: filters.favoritesOnly,
  });

  // Quick status chips (Bunko design): short reads, in progress, unread.
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

  const sorted = useMemo(
    () => [...library].sort((a, b) => b.savedAt - a.savedAt),
    [library],
  );
  const hero = useMemo(
    () => sorted.find((row) => !row.archived) ?? sorted[0] ?? null,
    [sorted],
  );

  const minutesToday = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return library
      .filter((row) => row.savedAt >= start.getTime())
      .reduce((n, row) => n + (row.readingMinutes || 0), 0);
  }, [library]);

  const rhythm = useMemo(() => {
    const days: { value: number; label: string }[] = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const start = new Date(d);
      start.setHours(0, 0, 0, 0);
      const end = new Date(d);
      end.setHours(23, 59, 59, 999);
      const value = library.filter(
        (row) => row.savedAt >= start.getTime() && row.savedAt <= end.getTime(),
      ).length;
      days.push({
        value,
        label: "SMTWTFS"[d.getDay()] ?? "",
      });
    }
    return days;
  }, [library]);

  const recentPassages = useMemo(
    () =>
      library
        .flatMap((row) =>
          (row.highlights ?? []).map((h) => ({ item: row, highlight: h })),
        )
        .sort((a, b) => b.highlight.createdAt - a.highlight.createdAt)
        .slice(0, 2),
    [library],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const isVault = filters.tab === "vault";

  return (
    <main className="kami-desk relative min-h-dvh overflow-x-hidden">
      <LibraryHeader
        onOpenTools={() => onToolsOpenChange(true)}
        tab={filters.tab}
        onTab={filters.onTab}
        minutesToday={minutesToday}
        passagesInked={vaultCount}
      />

      {/* Sub-navigation — Bunko Desk */}
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
                Reading Sanctuary
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
                  ref={searchRef}
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

          <div className="mt-6">
            <CaptureForm
              url={url}
              busy={busy}
              error={error}
              onUrlChange={onUrlChange}
              onClearError={onClearError}
              onSave={(next) => void onSave(next)}
              onSaveLinkOnly={() => void onSaveLinkOnly()}
              onOpenPaste={paste.onOpenPaste}
            />
          </div>

          <div className="mt-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <LibraryTabs
              tab={filters.tab}
              inboxCount={counts.inbox}
              archiveCount={counts.archived}
              vaultCount={vaultCount}
              onTab={filters.onTab}
            />
            {!isVault ? (
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
            ) : null}
          </div>

          {!isVault ? (
            <div className="mt-4">
              <LibraryFilters
                folderFilter={filters.folderFilter}
                tagFilter={filters.tagFilter}
                query={filters.query}
                favoritesOnly={filters.favoritesOnly}
                onFolder={filters.onFolder}
                onTag={filters.onTag}
                onQuery={filters.onQuery}
                onFavoritesOnly={filters.onFavoritesOnly}
              />
            </div>
          ) : null}
        </div>
      </section>

      {/* Main canvas */}
      <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-12">
        {isVault ? (
          <VaultView
            query={deferredQuery}
            onOpenItem={onOpenItem}
            onExitVault={() => filters.onTab("inbox")}
            onTranscribe={() => paste.onOpenPaste()}
          />
        ) : (
          <div className="grid grid-cols-1 items-start gap-8 xl:grid-cols-12">
            <div className="flex flex-col gap-10 xl:col-span-8">
              {hero && !deferredQuery ? <DeskHero item={hero} onOpen={onOpenItem} /> : null}

              {savingWithoutOpen ? (
                <p className="text-sm text-ink-muted" role="status" aria-live="polite">
                  Saving a clean copy…
                </p>
              ) : null}

              <div className="flex items-center justify-between pt-2">
                <p className="flex items-baseline gap-2">
                  <span className="font-display text-xl text-ink">Curated Scrolls</span>
                  <span className="font-sans text-xs text-ink-muted">
                    / Selected for Thoughtful Reflection
                  </span>
                </p>
              </div>

              <ViewTransition key={filters.tab} enter="fade-in" exit="fade-out" default="none">
                <ArticleList
                  items={visible}
                  emptyTitle={filters.tab === "archive" ? "Nothing archived" : "Your inbox is empty"}
                  emptyCopy={
                    filters.tab === "archive"
                      ? "Archive a piece after you finish it. It will wait here."
                      : "Paste a URL above to save a blog or X article for later."
                  }
                  onOpen={onOpenItem}
                  onRemove={removeItem}
                />
              </ViewTransition>
            </div>

            <aside className="flex flex-col gap-6 xl:col-span-4">
              <section className="kami-sheet p-6" aria-label="Reading rhythm">
                <div className="mb-4 flex items-center justify-between">
                  <p className="flex items-center gap-2 font-sans text-sm font-semibold text-ink">
                    <span className="size-2 rounded-full bg-ok" aria-hidden="true" />
                    Reading Rhythm
                  </p>
                  <span className="rounded-[0.25rem] bg-bamboo-wash px-2 py-0.5 font-sans text-[11px] font-semibold text-bamboo">
                    {library.length} bound
                  </span>
                </div>
                <div className="rounded-[0.25rem] bg-bg/70 p-4">
                  <RhythmBars
                    values={rhythm.map((d) => d.value)}
                    activeIndex={6}
                    labels={rhythm.map((d) => d.label)}
                  />
                </div>
                <p className="mt-4 font-body text-xs leading-relaxed text-ink-muted">
                  Bound works settle here like sheets on a desk —{" "}
                  <strong className="text-ink">{minutesToday} mins</strong> gathered today.
                </p>
              </section>

              <section className="kami-sheet p-6" aria-label="Recent inked passages">
                <div className="mb-4 flex items-center justify-between">
                  <p className="flex items-center gap-2 font-sans text-sm font-semibold text-ink">
                    <Highlighter className="size-[18px] text-hanko" aria-hidden="true" />
                    Recent Inked Passages
                  </p>
                  <button
                    type="button"
                    onClick={() => filters.onTab("vault")}
                    className="font-sans text-xs font-medium text-hanko hover:underline"
                  >
                    View Vault →
                  </button>
                </div>
                {recentPassages.length === 0 ? (
                  <p className="font-body text-sm text-ink-muted italic">
                    Select a passage in the reader to ink it onto washi.
                  </p>
                ) : (
                  <div className="flex flex-col gap-4">
                    {recentPassages.map(({ item, highlight }) => (
                      <button
                        key={highlight.id}
                        type="button"
                        onClick={() => onOpenItem(item)}
                        className="rounded-[0.25rem] border-l-2 border-hanko bg-bg/70 p-4 text-left transition-colors hover:bg-paper-warm"
                      >
                        <p className="font-body text-sm text-ink italic">
                          “{highlight.text}”
                        </p>
                        <p className="mt-2 flex items-center justify-between font-sans text-[11px] text-ink-muted">
                          <span className="truncate">{item.title}</span>
                        </p>
                      </button>
                    ))}
                  </div>
                )}
                {hero ? (
                  <button
                    type="button"
                    onClick={() => onOpenItem(hero)}
                    className="mt-5 flex w-full items-center justify-center gap-2 rounded-[0.25rem] bg-paper-warm py-2.5 font-sans text-xs font-medium text-ink transition-colors hover:bg-line"
                  >
                    <PenLine className="size-4" aria-hidden="true" />
                    Ink a New Passage
                  </button>
                ) : null}
              </section>

              <section className="kami-sheet p-6" aria-label="Folders and slipcases">
                <p className="kami-label mb-3 text-ink-muted">Folders &amp; Slipcases</p>
                <div className="flex flex-col gap-1.5 font-sans text-sm">
                  {folders.length === 0 ? (
                    <p className="px-3 py-2 font-body text-sm text-ink-muted italic">
                      No slipcases yet — file works into folders from the reader.
                    </p>
                  ) : (
                    folders.map((folder) => {
                      const n = library.filter((row) => row.folderId === folder.id).length;
                      return (
                        <button
                          key={folder.id}
                          type="button"
                          onClick={() => filters.onFolder(folder.id)}
                          className="flex items-center justify-between rounded-[0.25rem] px-3 py-2 text-ink-soft transition-colors hover:bg-paper-warm hover:text-ink"
                        >
                          <span className="flex items-center gap-2.5">
                            <BookOpen className="size-[18px] text-ink-muted" aria-hidden="true" />
                            {folder.name}
                          </span>
                          <span className="font-sans text-[11px] text-ink-muted">
                            {n} works
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </section>
            </aside>
          </div>
        )}
      </div>

      <footer className="w-full bg-paper py-12">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-4 px-4 sm:px-6 md:flex-row lg:px-12">
          <div className="flex items-center gap-3">
            <span className="kami-hanko flex size-7 items-center justify-center rounded-[0.25rem] font-display text-sm font-bold" aria-hidden="true">
              K
            </span>
            <p className="font-body text-sm text-ink-soft">
              © Kami Sanctuary. Mindful archival reading and contemplative journaling.
            </p>
          </div>
          <div className="flex items-center gap-6">
            <span className="flex items-center gap-1.5 font-sans text-xs text-ink-muted">
              <Clock3 className="size-3.5" aria-hidden="true" />
              {counts.inbox} on the desk
            </span>
            {vaultCount > 0 ? (
              <span className="flex items-center gap-1.5 font-sans text-xs text-ink-muted">
                <Highlighter className="size-3.5" aria-hidden="true" />
                {vaultCount} inked
              </span>
            ) : null}
          </div>
        </div>
      </footer>

      <PasteDialog
        open={paste.open}
        onOpenChange={paste.onOpenChange}
        title={paste.title}
        body={paste.body}
        url={paste.url}
        busy={paste.busy}
        onTitle={paste.onTitle}
        onBody={paste.onBody}
        onUrl={paste.onUrl}
        onImport={() => void paste.onImport()}
      />

      <ToolsDialog
        open={toolsOpen}
        onOpenChange={onToolsOpenChange}
        bookmarklet={bookmarklet}
      />
    </main>
  );
}

/** Hero — Currently on Desk. */
function DeskHero({
  item,
  onOpen,
}: {
  item: LibraryItem;
  onOpen: (item: LibraryItem) => void;
}) {
  const glyph = (item.siteName || item.title || "K").trim().charAt(0) || "K";
  const marginalia = (item.highlights?.length ?? 0) + (item.note ? 1 : 0);
  return (
    <div className="kami-sheet-raised group relative overflow-hidden p-8 md:p-10">
      {/* Bookmark ribbon (shiori) */}
      <div
        className="absolute top-0 right-10 z-20 flex h-28 w-6 flex-col items-center justify-end bg-hanko pb-2.5 shadow-md transition-all duration-300 group-hover:h-32"
        aria-hidden="true"
      >
        <span className="size-1.5 rounded-full bg-white/80" />
        <span className="absolute -bottom-2.5 left-0 size-0 border-x-[12px] border-b-[10px] border-x-hanko border-b-transparent" />
      </div>
      <div
        className="pointer-events-none absolute -right-20 -bottom-20 size-80 rounded-full bg-hanko/10 blur-3xl"
        aria-hidden="true"
      />
      <div className="relative z-10">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <WashiTag tone="vermilion">Currently On Desk</WashiTag>
          <span className="font-sans text-[11px] text-ink-muted">
            {item.source === "x" ? "X" : item.siteName || "Article"} · {item.readingMinutes} min
          </span>
        </div>
        <h3 className="mb-2 font-display text-2xl leading-tight tracking-tight text-ink md:text-3xl">
          {item.title}
        </h3>
        {item.excerpt ? (
          <p className="mb-6 line-clamp-2 max-w-2xl font-body text-base text-ink-soft">
            {item.author ? `${item.author} — ` : ""}
            {item.excerpt}
          </p>
        ) : null}
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={() => onOpen(item)}
            className="inline-flex items-center gap-2 rounded-[0.25rem] bg-hanko px-5 py-2.5 font-sans text-sm font-semibold text-white shadow-sm transition-all hover:bg-shu active:translate-y-px"
          >
            <BookOpen className="size-[18px]" aria-hidden="true" />
            Continue Reading
          </button>
          <span className="inline-flex items-center gap-1.5 rounded-[0.25rem] bg-paper-warm px-4 py-2.5 font-sans text-sm text-ink-soft">
            <PenLine className="size-[18px]" aria-hidden="true" />
            {marginalia} Inked Marginalia
          </span>
          <Hanko glyph={glyph} square className="ml-auto size-8 text-sm" title={item.siteName} />
        </div>
      </div>
    </div>
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
