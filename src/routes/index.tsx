import { createFileRoute, Link } from "@tanstack/react-router";
import { addTransitionType, startTransition, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { AppGate } from "@/components/app-gate.tsx";
import { ArticleList } from "@/components/article-list.tsx";
import { DirectionalTransition } from "@/components/directional-transition.tsx";
import { CaptureForm } from "@/components/library/capture-form.tsx";
import { CommandPalette } from "@/components/library/command-palette.tsx";
import { PasteDialog, ToolsDialog } from "@/components/library/library-dialogs.tsx";
import {
  DeskHero,
  FoldersCard,
  ReadingRhythmCard,
  RecentPassagesCard,
  SiteFooter,
  useDeskHeroItem,
} from "@/components/library/widgets.tsx";
import { SiteHeader } from "@/components/site-header.tsx";
import { KamiEyebrow } from "@/components/kami.tsx";
import { useCaptureTools } from "@/hooks/use-capture-tools.ts";
import { usePasteImport } from "@/hooks/use-paste-import.ts";
import { useSaveArticle } from "@/hooks/use-save-article.ts";
import { buildBookmarklet, decodeImportPayload } from "@/lib/bookmarklet.ts";
import { readDraftUrl } from "@/lib/session-article.ts";
import { useLibraryStore, type LibraryItem } from "@/lib/store.ts";

type HomeSearch = {
  import?: string;
};

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): HomeSearch => ({
    import:
      typeof search.import === "string" && search.import.length > 0 ? search.import : undefined,
  }),
  component: HomePage,
});

function goRead(
  navigate: ReturnType<typeof Route.useNavigate>,
  id: string,
) {
  startTransition(() => {
    addTransitionType("nav-forward");
    void navigate({ to: "/read", search: { id } });
  });
}

function HomePage() {
  return (
    <AppGate>
      <DirectionalTransition>
        <Home />
      </DirectionalTransition>
    </AppGate>
  );
}

function Home() {
  const navigate = Route.useNavigate();
  const search = Route.useSearch();
  const tools = useCaptureTools();
  const booted = useRef(false);

  const openOnSave = (id: string | null) => {
    if (id) goRead(navigate, id);
  };
  const save = useSaveArticle(openOnSave);
  const paste = usePasteImport(openOnSave);

  const hero = useDeskHeroItem();
  const library = useLibraryStore((s) => s.library);
  const removeItem = useLibraryStore((s) => s.removeItem);
  const fresh = useMemo(
    () =>
      [...library]
        .filter((row) => !row.archived)
        .sort((a, b) => b.savedAt - a.savedAt)
        .slice(0, 4),
    [library],
  );

  function openItem(item: LibraryItem) {
    goRead(navigate, item.id);
  }

  function openPaste(seedUrl?: string) {
    if (seedUrl) paste.setPasteUrl(seedUrl);
    paste.setPasteOpen(true);
  }

  async function openItemOrFetch(item: LibraryItem) {
    openItem(item);
    if (!item.contentHtml) await save.save(item.url, true);
  }

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;

    // ⌘K is handled by CommandPalette.
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
    } else {
      const draft = readDraftUrl();
      if (draft) {
        save.setUrl(draft);
        void save.save(draft, true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="kami-desk relative flex min-h-dvh flex-col overflow-x-hidden">
      <SiteHeader active="home" onOpenTools={() => tools.setToolsOpen(true)} />

      <div className="flex-1">
      <section className="w-full bg-paper/60 backdrop-blur-sm">
        <div className="mx-auto w-full max-w-7xl px-4 pt-10 pb-8 sm:px-6 lg:px-12">
          <KamiEyebrow>
            Kami Sanctuary
          </KamiEyebrow>
          <h1 className="mt-2 font-display text-4xl tracking-tight text-ink sm:text-5xl">
            Your quiet reading list.
          </h1>
          <p className="mt-3 max-w-xl font-body text-base leading-relaxed text-ink-soft">
            Paste a link to bind it into washi. Read distraction-free, ink what
            resonates, and find it all in the vault.
          </p>
          <div className="mt-6 max-w-2xl">
            <CaptureForm
              url={save.url}
              busy={save.busy}
              error={save.error}
              onUrlChange={save.setUrl}
              onClearError={() => save.setError("")}
              onSave={(next) => void save.save(next, true)}
              onSaveLinkOnly={() => void save.saveLinkOnly()}
              onOpenPaste={openPaste}
            />
          </div>
          {save.busy ? (
            <p className="mt-3 text-sm text-ink-muted" role="status" aria-live="polite">
              Saving a clean copy…
            </p>
          ) : null}
        </div>
      </section>

      <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-12">
        {hero ? (
          <DeskHero item={hero} onOpen={(item) => void openItemOrFetch(item)} />
        ) : null}

        <div className="mt-10 grid grid-cols-1 items-start gap-8 xl:grid-cols-12">
          <div className="xl:col-span-8">
            <div className="flex items-baseline justify-between gap-3">
              <p className="flex items-baseline gap-2">
                <span className="font-display text-xl text-ink">Fresh on the Desk</span>
                <span className="font-sans text-xs text-ink-muted">/ Latest bindings</span>
              </p>
              <Link
                to="/library"
                className="shrink-0 font-sans text-xs font-medium text-hanko hover:underline"
              >
                Browse Library →
              </Link>
            </div>
            <div className="mt-6">
              <ArticleList
                items={fresh}
                emptyTitle="Your desk is empty"
                emptyCopy="Paste a URL above to save a blog or X article for later."
                onOpen={(item) => void openItemOrFetch(item)}
                onRemove={removeItem}
              />
            </div>
          </div>
          <aside className="flex flex-col gap-6 xl:col-span-4">
            <ReadingRhythmCard />
            <RecentPassagesCard onOpenItem={(item) => void openItemOrFetch(item)} hero={hero} />
            <FoldersCard />
          </aside>
        </div>
      </div>
      </div>

      <SiteFooter />

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

      <ToolsDialog
        open={tools.toolsOpen}
        onOpenChange={tools.setToolsOpen}
        bookmarklet={tools.bookmarklet || buildBookmarklet(window.location.origin)}
      />

      <CommandPalette onOpenItem={(item) => void openItemOrFetch(item)} />
    </main>
  );
}
