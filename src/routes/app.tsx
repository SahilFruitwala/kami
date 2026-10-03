import { createFileRoute } from "@tanstack/react-router";
import { addTransitionType, startTransition, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell.tsx";
import { CaptureForm } from "@/components/library/capture-form.tsx";
import {
  HomeCaptureTabs,
  ShelfQuickCapture,
  type HomeCaptureType,
} from "@/components/library/home-shelves.tsx";
import { BulkSaveDialog, PasteDialog } from "@/components/library/library-dialogs.tsx";
import { usePasteImport } from "@/hooks/use-paste-import.ts";
import { useBulkSave } from "@/hooks/use-bulk-save.ts";
import { useSaveArticle } from "@/hooks/use-save-article.ts";
import { importArticle } from "@/lib/article-fns.ts";
import { decodeImportPayload, type BookmarkletPayload } from "@/lib/bookmarklet.ts";
import {
  parseBulkUrls,
  readDraftUrl,
  stashImportPayload,
  takeStashedImportPayload,
} from "@/lib/session-article.ts";
import { persistArticleItem } from "@/lib/library-remote.ts";
import { articleToItem, type LibraryItem } from "@/lib/store.ts";

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

  // Runs outside AppGate so `?import=` survives the signed-out landing page.
  // Home never gates on the library boot, so this stash always runs.
  useEffect(() => {
    if (search.import) {
      stashImportPayload(search.import);
      void navigate({
        search: (prev: HomeSearch) => {
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
  const bulk = useBulkSave();

  const [capturing, setCapturing] = useState(false);
  const [captureType, setCaptureType] = useState<HomeCaptureType>("article");

  function openItem(item: LibraryItem) {
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
          search: (prev: HomeSearch) => {
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
      <div className="mx-auto flex min-h-[70dvh] w-full max-w-3xl flex-col items-center justify-center px-4 py-10 sm:px-6">
        <p className="font-display text-5xl tracking-tight text-ink" translate="no">
          Kami
        </p>
        <div className="mt-8 w-full">
          <HomeCaptureTabs value={captureType} onChange={setCaptureType} />
          <div className="mt-3">
            {captureType === "article" ? (
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
            ) : (
              <ShelfQuickCapture key={captureType} type={captureType} />
            )}
          </div>
        </div>
        {captureType === "article" && (save.busy || capturing) ? (
          <p className="mt-3 text-sm text-ink-muted" role="status" aria-live="polite">
            {capturing ? "Importing captured page…" : "Saving a clean copy…"}
          </p>
        ) : null}
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
