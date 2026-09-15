import { createFileRoute } from "@tanstack/react-router";
import { addTransitionType, startTransition, useEffect, useRef } from "react";
import { AppGate } from "@/components/app-gate.tsx";
import { DirectionalTransition } from "@/components/directional-transition.tsx";
import { ToolsDialog } from "@/components/library/library-dialogs.tsx";
import { CommandPalette } from "@/components/library/command-palette.tsx";
import { LibraryHome } from "@/components/library/library-home.tsx";
import { SiteFooter } from "@/components/library/widgets.tsx";
import { SiteHeader } from "@/components/site-header.tsx";
import { useCaptureTools } from "@/hooks/use-capture-tools.ts";
import { useLibraryFilters } from "@/hooks/use-library-filters.ts";
import { useSaveArticle } from "@/hooks/use-save-article.ts";
import type { LibraryItem } from "@/lib/store.ts";

type LibrarySearch = {
  folder?: string;
  tab?: string;
  q?: string;
  tag?: string;
  fav?: string;
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
  }),
  component: LibraryPage,
});

function LibraryPage() {
  return (
    <AppGate>
      <DirectionalTransition>
        <Library />
      </DirectionalTransition>
    </AppGate>
  );
}

function Library() {
  const navigate = Route.useNavigate();
  const search = Route.useSearch();
  const tools = useCaptureTools();
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
          },
          replace: true,
        });
      }, 300);
      return () => {
        if (pushTimer.current) clearTimeout(pushTimer.current);
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filters.tab, filters.folderFilter, filters.tagFilter, filters.query, filters.favoritesOnly],
  );

  async function openItemOrFetch(item: LibraryItem) {
    startTransition(() => {
      addTransitionType("nav-forward");
      void navigate({ to: "/read", search: { id: item.id } });
    });
    if (!item.contentHtml) await fetchSave.save(item.url, true);
  }

  return (
    <main id="main" className="kami-desk relative flex min-h-dvh flex-col overflow-x-hidden [touch-action:manipulation]">
      <a href="#main" className="sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:top-2 focus-visible:left-2 focus-visible:z-50 focus-visible:rounded-md focus-visible:bg-ink focus-visible:px-4 focus-visible:py-2 focus-visible:text-sm focus-visible:text-paper">Skip to content</a>
      <SiteHeader active="library" onOpenTools={() => tools.setToolsOpen(true)} />
      <div className="flex-1">
      <LibraryHome
        filters={{
          tab: filters.tab,
          folderFilter: filters.folderFilter,
          tagFilter: filters.tagFilter,
          query: filters.query,
          favoritesOnly: filters.favoritesOnly,
          onTab: filters.setTab,
          onFolder: filters.setFolderFilter,
          onTag: filters.setTagFilter,
          onQuery: filters.setQuery,
          onFavoritesOnly: filters.setFavoritesOnly,
        }}
        onOpenItem={(item) => void openItemOrFetch(item)}
      />
      </div>
      <SiteFooter />
      <ToolsDialog
        open={tools.toolsOpen}
        onOpenChange={tools.setToolsOpen}
        bookmarklet={tools.bookmarklet}
      />
      <CommandPalette onOpenItem={(item) => void openItemOrFetch(item)} />
    </main>
  );
}
