import { createFileRoute } from "@tanstack/react-router";
import { addTransitionType, startTransition, useEffect, useRef } from "react";
import { AppShell } from "@/components/app-shell.tsx";
import { CaptureForm } from "@/components/library/capture-form.tsx";
import { BulkSaveDialog, PasteDialog } from "@/components/library/library-dialogs.tsx";
import { LibraryHome } from "@/components/library/library-home.tsx";
import { useBulkSave } from "@/hooks/use-bulk-save.ts";
import { useLibraryFilters } from "@/hooks/use-library-filters.ts";
import { usePasteImport } from "@/hooks/use-paste-import.ts";
import { useSaveArticle } from "@/hooks/use-save-article.ts";
import { isLibrarySort } from "@/lib/filter-library.ts";
import { parseBulkUrls } from "@/lib/session-article.ts";
import type { LibraryItem } from "@/lib/store.ts";

type LibrarySearch = {
  folder?: string;
  tab?: string;
  q?: string;
  tag?: string;
  fav?: string;
  sort?: string;
};

export const Route = createFileRoute("/library")({
  validateSearch: (search: Record<string, unknown>): LibrarySearch => ({
    folder:
      typeof search.folder === "string" && search.folder.length > 0
        ? search.folder
        : undefined,
    tab: search.tab === "archive" || search.tab === "inbox" ? search.tab : undefined,
    q: typeof search.q === "string" && search.q.length > 0 ? search.q : undefined,
    tag: typeof search.tag === "string" && search.tag.length > 0 ? search.tag : undefined,
    fav: search.fav === "1" ? "1" : undefined,
    sort: typeof search.sort === "string" && search.sort.length > 0 ? search.sort : undefined,
  }),
  component: LibraryPage,
});

function LibraryPage() {
  return <Library />;
}

function goRead(
  navigate: ReturnType<typeof Route.useNavigate>,
  id: string,
) {
  startTransition(() => {
    addTransitionType("nav-forward");
    void navigate({ to: "/read", search: { id } });
  });
}

function Library() {
  const navigate = Route.useNavigate();
  const search = Route.useSearch();
  const filters = useLibraryFilters();
  const bulk = useBulkSave();
  const syncedFromUrl = useRef(false);
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openOnSave = (id: string | null) => {
    if (id) goRead(navigate, id);
  };
  const save = useSaveArticle(openOnSave);
  const paste = usePasteImport(openOnSave);

  // One-way: URL → local filter state on first paint (deep links).
  useEffect(() => {
    if (syncedFromUrl.current) return;
    syncedFromUrl.current = true;
    if (search.tab === "archive" || search.tab === "inbox") filters.setTab(search.tab);
    if (search.folder) filters.setFolderFilter(search.folder);
    if (search.tag) filters.setTagFilter(search.tag);
    if (typeof search.q === "string") filters.setQuery(search.q);
    if (search.fav === "1") filters.setFavoritesOnly(true);
    if (isLibrarySort(search.sort)) filters.setSort(search.sort);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Other way: local filter state → URL (debounced for typing).
  useEffect(
    () => {
      if (!syncedFromUrl.current) return;
      if (pushTimer.current) clearTimeout(pushTimer.current);
      pushTimer.current = setTimeout(() => {
        void navigate({
          search: {
            folder: filters.folderFilter === "all" ? undefined : filters.folderFilter,
            tab: filters.tab === "inbox" ? undefined : filters.tab,
            q: filters.query ? filters.query : undefined,
            tag: filters.tagFilter ?? undefined,
            fav: filters.favoritesOnly ? "1" : undefined,
            sort: filters.sort === "newest" ? undefined : filters.sort,
          },
          replace: true,
        });
      }, 300);
      return () => {
        if (pushTimer.current) clearTimeout(pushTimer.current);
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filters.tab, filters.folderFilter, filters.tagFilter, filters.query, filters.favoritesOnly, filters.sort],
  );

  function openItem(item: LibraryItem) {
    // Reader loads the stored body on demand (lean library boot omits
    // contentHtml); link-only stubs re-extract inside `/read`.
    goRead(navigate, item.id);
  }

  function openPaste(seedUrl?: string) {
    if (seedUrl) paste.setPasteUrl(seedUrl);
    paste.setPasteOpen(true);
  }

  function openBulk(seedText?: string) {
    if (seedText && !bulk.draft) bulk.setDraft(seedText);
    bulk.setOpen(true);
  }

  function saveSingleOrBulk(next?: string) {
    const raw = next ?? save.url;
    if (parseBulkUrls(raw).length > 1) {
      bulk.setDraft(raw);
      bulk.setOpen(true);
      return;
    }
    void save.save(next, true);
  }

  return (
    <AppShell active="library" onOpenItem={openItem} requireLibrary>
      <LibraryHome
        filters={{
          tab: filters.tab,
          folderFilter: filters.folderFilter,
          tagFilter: filters.tagFilter,
          query: filters.query,
          favoritesOnly: filters.favoritesOnly,
          sort: filters.sort,
          onTab: filters.setTab,
          onFolder: filters.setFolderFilter,
          onTag: filters.setTagFilter,
          onQuery: filters.setQuery,
          onFavoritesOnly: filters.setFavoritesOnly,
          onSort: filters.setSort,
        }}
        capture={
          <CaptureForm
            url={save.url}
            busy={save.busy}
            error={save.error}
            onUrlChange={save.setUrl}
            onClearError={() => save.setError("")}
            onSave={saveSingleOrBulk}
            onSaveLinkOnly={() => void save.saveLinkOnly()}
            onOpenPaste={openPaste}
            onOpenBulk={openBulk}
          />
        }
        onOpenItem={openItem}
        onOpenBulk={() => bulk.setOpen(true)}
      />
      <PasteDialog
        open={paste.pasteOpen}
        onOpenChange={paste.setPasteOpen}
        title={paste.pasteTitle}
        body={paste.pasteBody}
        url={paste.pasteUrl}
        busy={paste.busy}
        onTitle={paste.setPasteTitle}
        onBody={paste.setPasteBody}
        onUrl={paste.setPasteUrl}
        onImport={() => void paste.importPasted()}
      />
      <BulkSaveDialog
        open={bulk.open}
        onOpenChange={bulk.setOpen}
        draft={bulk.draft}
        urls={bulk.urls}
        overflow={bulk.overflow}
        busy={bulk.busy}
        progress={bulk.progress}
        onDraft={bulk.setDraft}
        onSave={() => void bulk.saveAll()}
      />
    </AppShell>
  );
}
