import { createFileRoute } from "@tanstack/react-router";
import { addTransitionType, startTransition, useEffect, useRef } from "react";
import { AppShell } from "@/components/app-shell.tsx";
import { LibraryHome } from "@/components/library/library-home.tsx";
import { useLibraryFilters } from "@/hooks/use-library-filters.ts";
import { useSaveArticle } from "@/hooks/use-save-article.ts";
import { isLibrarySort } from "@/lib/filter-library.ts";
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

function Library() {
  const navigate = Route.useNavigate();
  const search = Route.useSearch();
  const filters = useLibraryFilters();
  // Fetch-on-open for works saved as link-only (no clean copy yet).
  const fetchSave = useSaveArticle(() => {});
  const syncedFromUrl = useRef(false);
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  async function openItemOrFetch(item: LibraryItem) {
    startTransition(() => {
      addTransitionType("nav-forward");
      void navigate({ to: "/read", search: { id: item.id } });
    });
    if (!item.contentHtml) await fetchSave.save(item.url, true);
  }

  return (
    <AppShell active="library" onOpenItem={(item) => void openItemOrFetch(item)}>
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
        onOpenItem={(item) => void openItemOrFetch(item)}
      />
    </AppShell>
  );
}
