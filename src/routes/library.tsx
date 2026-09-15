import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { addTransitionType, startTransition, useEffect } from "react";
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
};

export const Route = createFileRoute("/library")({
  validateSearch: (search: Record<string, unknown>): LibrarySearch => ({
    folder:
      typeof search.folder === "string" && search.folder.length > 0
        ? search.folder
        : undefined,
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
  const navigate = useNavigate();
  const search = Route.useSearch();
  const tools = useCaptureTools();
  const filters = useLibraryFilters();
  // Fetch-on-open for works saved as link-only (no clean copy yet).
  const fetchSave = useSaveArticle(() => {});

  useEffect(() => {
    if (search.folder) filters.setFolderFilter(search.folder);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
