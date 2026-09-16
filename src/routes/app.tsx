import { createFileRoute, Link } from "@tanstack/react-router";
import { addTransitionType, startTransition, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell.tsx";
import { ArticleList } from "@/components/article-list.tsx";
import { CaptureForm } from "@/components/library/capture-form.tsx";
import { PasteDialog } from "@/components/library/library-dialogs.tsx";
import {
  DeskHero,
  EmptyDeskGuide,
  FoldersCard,
  ReadingRhythmCard,
  RecentPassagesCard,
  useDeskHeroItem,
} from "@/components/library/widgets.tsx";
import { KamiEyebrow } from "@/components/kami.tsx";
import { usePasteImport } from "@/hooks/use-paste-import.ts";
import { useSaveArticle } from "@/hooks/use-save-article.ts";
import { importArticle } from "@/lib/article-fns.ts";
import { decodeImportPayload, type BookmarkletPayload } from "@/lib/bookmarklet.ts";
import {
  readDraftUrl,
  stashImportPayload,
  takeStashedImportPayload,
} from "@/lib/session-article.ts";
import { persistArticleItem } from "@/lib/library-remote.ts";
import { articleToItem, useLibraryStore, type LibraryItem } from "@/lib/store.ts";

type HomeSearch = {
  import?: string;
};

export const Route = createFileRoute("/app")({
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
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  // Runs outside AppGate so `?import=` survives the signed-out landing page
  // and the library-loading skeleton (both render instead of <Home />).
  useEffect(() => {
    if (search.import) {
      stashImportPayload(search.import);
      void navigate({
        search: (prev) => {
          const next = { ...prev };
          delete next.import;
          return next;
        },
        replace: true,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <Home />;
}

function Home() {
  const navigate = Route.useNavigate();
  const search = Route.useSearch();
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

  const [capturing, setCapturing] = useState(false);

  function openItem(item: LibraryItem) {
    goRead(navigate, item.id);
  }

  function openPaste(seedUrl?: string) {
    if (seedUrl) paste.setPasteUrl(seedUrl);
    paste.setPasteOpen(true);
  }

  /**
   * Bookmarklet capture: process the grabbed HTML, save the clean copy, and
   * open the reader — no raw-HTML review step. Falls back to the manual
   * Paste dialog only when auto-import can't make an article of it.
   */
  async function autoImportCapture(payload: BookmarkletPayload) {
    const looksHtml = /<\/?[a-z][\s\S]*>/i.test(payload.html);
    if (!payload.title.trim() || !payload.html.trim()) {
      paste.seedPaste(payload);
      toast.message("Captured from bookmarklet — review and import.");
      return;
    }
    setCapturing(true);
    try {
      const result = await importArticle({
        data: {
          url: payload.url.trim() || undefined,
          title: payload.title.trim(),
          contentHtml: looksHtml ? payload.html : undefined,
          contentText: looksHtml ? undefined : payload.html,
        },
      });
      if (!result.ok) {
        paste.seedPaste(payload);
        toast.error("Auto-import needs a hand — review and import below.");
        return;
      }
      // Same id as persist's optimistic row (ids derive from the URL), so the
      // offline branch below can open it without writing twice.
      const local = articleToItem(result.article);
      try {
        const saved = await persistArticleItem(local);
        toast.success("Captured from bookmarklet — saved");
        goRead(navigate, saved.id);
      } catch (err) {
        console.error("[bookmarklet] persist failed:", err);
        if (typeof navigator !== "undefined" && navigator.onLine === false) {
          toast.success("Saved here — will sync when back online");
          goRead(navigate, local.id);
        } else {
          paste.seedPaste(payload);
          toast.error(err instanceof Error ? err.message : "Could not save that capture.");
        }
      }
    } catch {
      paste.seedPaste(payload);
      toast.message("Captured from bookmarklet — review and import.");
    } finally {
      setCapturing(false);
    }
  }

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;

    // ⌘K is handled by CommandPalette.
    // `?import=` is stashed by <HomePage /> before the auth gate, so pick up
    // the stash here (covers signed-out → sign-in and loading states).
    // Bookmarklet captures are imported automatically — process, save, open —
    // and only fall back to the manual review dialog when auto-import fails.
    const raw = search.import ?? takeStashedImportPayload();
    if (raw) {
      const payload = decodeImportPayload(raw);
      if (payload) {
        void autoImportCapture(payload);
      } else {
        toast.error(
          "Could not read the captured page — the URL was likely truncated. Try a smaller article section or Paste article instead.",
        );
      }
      if (search.import) {
        void navigate({
          search: (prev) => {
            const next = { ...prev };
            delete next.import;
            return next;
          },
          replace: true,
        });
      }
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
    <AppShell active="home" onOpenItem={openItem}>
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
          {save.busy || capturing ? (
            <p className="mt-3 text-sm text-ink-muted" role="status" aria-live="polite">
              {capturing ? "Importing captured page…" : "Saving a clean copy…"}
            </p>
          ) : null}
        </div>
      </section>

      <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-12">
        {library.length === 0 ? (
          <EmptyDeskGuide />
        ) : hero ? (
          <DeskHero item={hero} onOpen={openItem} />
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
                onOpen={openItem}
                onRemove={removeItem}
              />
            </div>
          </div>
          <aside className="flex flex-col gap-6 xl:col-span-4">
            <ReadingRhythmCard />
            <RecentPassagesCard onOpenItem={openItem} hero={hero} />
            <FoldersCard />
          </aside>
        </div>
      </div>

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
    </AppShell>
  );
}
