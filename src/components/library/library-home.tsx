import { useDeferredValue, ViewTransition } from "react";
import { ArticleList } from "@/components/article-list.tsx";
import { CaptureForm } from "@/components/library/capture-form.tsx";
import { LibraryHeader } from "@/components/library/library-header.tsx";
import { PasteDialog, ToolsDialog } from "@/components/library/library-dialogs.tsx";
import { LibraryTabs } from "@/components/library/library-tabs.tsx";
import { LibraryFilters } from "@/components/library-filters.tsx";
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
  const removeItem = useLibraryStore((s) => s.removeItem);
  const counts = countByArchive(library);
  const visible = filterLibraryItems(library, {
    tab: filters.tab,
    folderFilter: filters.folderFilter,
    tagFilter: filters.tagFilter,
    query: deferredQuery,
    favoritesOnly: filters.favoritesOnly,
  });

  return (
    <main className="relative min-h-dvh overflow-x-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[linear-gradient(180deg,color-mix(in_oklab,var(--color-paper-warm)_70%,transparent),transparent)]"
      />
      <LibraryHeader onOpenTools={() => onToolsOpenChange(true)} />

      <div className="relative mx-auto w-full max-w-3xl px-4 pb-20 sm:px-6">
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

        <LibraryTabs
          tab={filters.tab}
          inboxCount={counts.inbox}
          archiveCount={counts.archived}
          onTab={filters.onTab}
        />

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

        {savingWithoutOpen ? (
          <p className="mt-6 text-sm text-muted">Saving a clean copy…</p>
        ) : null}

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
