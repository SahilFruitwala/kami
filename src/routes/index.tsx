import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { DirectionalTransition } from "@/components/directional-transition.tsx";
import { LibraryHome } from "@/components/library/library-home.tsx";
import { ReaderView } from "@/components/reader-view.tsx";
import { useLibraryFilters } from "@/hooks/use-library-filters.ts";
import { useLibraryNav } from "@/hooks/use-library-nav.ts";
import { usePasteImport } from "@/hooks/use-paste-import.ts";
import { useSaveArticle } from "@/hooks/use-save-article.ts";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { buildBookmarklet, decodeImportPayload } from "@/lib/bookmarklet.ts";
import {
  bootstrapLibraryFromServer,
  clearLibraryLocal,
} from "@/lib/library-remote";
import { readDraftUrl } from "@/lib/session-article.ts";
import {
  itemToArticle,
  useLibraryStore,
  type LibraryItem,
} from "@/lib/store.ts";

type HomeSearch = {
  id?: string;
  import?: string;
};

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): HomeSearch => ({
    id: typeof search.id === "string" && search.id.length > 0 ? search.id : undefined,
    import:
      typeof search.import === "string" && search.import.length > 0 ? search.import : undefined,
  }),
  component: QuartoApp,
});

function QuartoApp() {
  const { user, isPending } = useCurrentUserState();
  const userId = user?.id;
  const [libraryReady, setLibraryReady] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);

  useEffect(() => {
    if (isPending) return;
    if (!userId) {
      clearLibraryLocal();
      setLibraryReady(false);
      setLibraryError(null);
      return;
    }

    let cancelled = false;
    setLibraryReady(false);
    setLibraryError(null);

    void bootstrapLibraryFromServer()
      .then(() => {
        if (!cancelled) setLibraryReady(true);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message =
          error instanceof Error ? error.message : "Could not load your library.";
        setLibraryError(message);
      });

    return () => {
      cancelled = true;
    };
  }, [userId, isPending]);

  if (isPending) {
    return <AuthLoadingScreen label="Checking your session…" />;
  }

  if (!user) {
    return <RedirectToSignIn />;
  }

  if (libraryError) {
    return (
      <AuthLoadingScreen
        label={libraryError}
        actionLabel="Try again"
        onAction={() => {
          setLibraryError(null);
          setLibraryReady(false);
          void bootstrapLibraryFromServer()
            .then(() => setLibraryReady(true))
            .catch((error: unknown) => {
              const message =
                error instanceof Error
                  ? error.message
                  : "Could not load your library.";
              setLibraryError(message);
            });
        }}
      />
    );
  }

  if (!libraryReady) {
    return <AuthLoadingScreen label="Loading your library…" />;
  }

  return <Home />;
}

function AuthLoadingScreen({
  label,
  actionLabel,
  onAction,
}: {
  label: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-paper px-6 text-ink">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <p className="font-display text-2xl tracking-tight">Quarto</p>
        <p className="text-sm text-muted">{label}</p>
        {actionLabel && onAction ? (
          <button
            type="button"
            onClick={onAction}
            className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper transition hover:opacity-90"
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function Home() {
  const [toolsOpen, setToolsOpen] = useState(false);
  const [bookmarklet, setBookmarklet] = useState("");
  const booted = useRef(false);

  const navigate = Route.useNavigate();
  const search = Route.useSearch();

  const { openId, goOpen } = useLibraryNav(navigate, search.id);
  const save = useSaveArticle(goOpen);
  const paste = usePasteImport(goOpen);
  const filters = useLibraryFilters();

  const openItem = useLibraryStore((s) =>
    openId ? (s.library.find((row) => row.id === openId) ?? null) : null,
  );
  const archiveItem = useLibraryStore((s) => s.archiveItem);
  const article = openItem?.contentHtml ? itemToArticle(openItem) : null;

  async function openItemOrFetch(item: LibraryItem) {
    goOpen(item.id);
    if (!item.contentHtml) await save.save(item.url, true);
  }

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    setBookmarklet(buildBookmarklet(window.location.origin));

    if (search.import) {
      const payload = decodeImportPayload(search.import);
      if (payload) {
        paste.seedPaste(payload);
        toast.message("Captured from bookmarklet — review and import.");
      }
      void navigate({
        search: (prev) => {
          const next = { ...prev };
          delete next.import;
          return next;
        },
        replace: true,
      });
      return;
    }

    const draft = readDraftUrl();
    if (draft && !search.id) {
      save.setUrl(draft);
      void save.save(draft, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (article && openItem) {
    return (
      <DirectionalTransition>
        <ReaderView
          item={openItem}
          article={article}
          onBack={() => goOpen(null)}
          onArchive={() => {
            archiveItem(openItem.id, !openItem.archived);
            if (!openItem.archived) {
              goOpen(null);
              toast.success("Archived");
            } else {
              toast.success("Moved to inbox");
            }
          }}
        />
      </DirectionalTransition>
    );
  }

  return (
    <DirectionalTransition>
      <LibraryHome
        url={save.url}
        busy={save.busy || paste.busy}
        error={save.error}
        savingWithoutOpen={save.busy && !openId}
        bookmarklet={bookmarklet}
        toolsOpen={toolsOpen}
        onToolsOpenChange={setToolsOpen}
        onUrlChange={save.setUrl}
        onClearError={() => save.setError("")}
        onSave={(url) => void save.save(url, true)}
        onSaveLinkOnly={() => void save.saveLinkOnly()}
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
        paste={{
          open: paste.pasteOpen,
          onOpenChange: paste.setPasteOpen,
          title: paste.pasteTitle,
          body: paste.pasteBody,
          url: paste.pasteUrl,
          busy: paste.busy,
          onTitle: paste.setPasteTitle,
          onBody: paste.setPasteBody,
          onUrl: paste.setPasteUrl,
          onImport: () => void paste.importPasted(),
          onOpenPaste: (seed) => {
            if (seed) paste.setPasteUrl(seed);
            paste.setPasteOpen(true);
          },
        }}
        onOpenItem={(item) => void openItemOrFetch(item)}
      />
    </DirectionalTransition>
  );
}
