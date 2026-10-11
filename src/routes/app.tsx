import { createFileRoute, redirect } from "@tanstack/react-router";
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
import { WeeklyRecap } from "@/components/library/weekly-recap.tsx";
import { usePasteImport } from "@/hooks/use-paste-import.ts";
import { useBulkSave } from "@/hooks/use-bulk-save.ts";
import { useSaveArticle } from "@/hooks/use-save-article.ts";
import { articlesApi } from "@/lib/api/articles";
import type { BookmarkletPayload } from "@/lib/bookmarklet.ts";
import {
  parseBulkUrls,
  readDraftUrl,
  takeStashedCapturePayload,
  writeDraftUrl,
} from "@/lib/session-article.ts";
import { persistArticleItem } from "@/lib/library-remote.ts";
import { articleToItem, type LibraryItem } from "@/lib/store.ts";

type HomeSearch = {
  /** URL handed over by the share sheet (`/share`) — saved on arrival. */
  save?: string;
};

export const Route = createFileRoute("/app")({
  validateSearch: (search: Record<string, unknown>): HomeSearch => ({
    save: typeof search.save === "string" && search.save.length > 0 ? search.save : undefined,
  }),
  // Bookmarklets created before the /capture handoff opened `/app?import=…`.
  beforeLoad: ({ location }) => {
    const legacy = new URLSearchParams(location.searchStr).get("import");
    if (legacy) throw redirect({ to: "/capture", search: { import: legacy }, replace: true });
  },
  component: HomePage,
});

function goRead(navigate: ReturnType<typeof Route.useNavigate>, id: string) {
  startTransition(() => {
    addTransitionType("nav-forward");
    void navigate({ to: "/read", search: { id } });
  });
}

function HomePage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  // Runs outside AppGate so a shared URL survives a detour through sign-in:
  // park it as the draft, which <PendingCapturePickup /> saves once signed in.
  useEffect(() => {
    if (search.save) {
      writeDraftUrl(search.save);
      void navigate({ search: {}, replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <Home />;
}

/**
 * Picks up work handed to Home from elsewhere — a page captured by the
 * bookmarklet/extension (stashed by `/capture`), or a URL from the share
 * sheet or an interrupted save. Rendered inside <AppShell>, so it only mounts
 * once the session is confirmed: a signed-out visitor keeps the stash for
 * after sign-in instead of spending it on a request that can't succeed.
 */
function PendingCapturePickup({
  onCapture,
  onUrl,
}: {
  onCapture: (payload: BookmarkletPayload) => void;
  onUrl: (url: string) => void;
}) {
  const search = Route.useSearch();
  const booted = useRef(false);
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    const payload = takeStashedCapturePayload();
    if (payload) {
      onCapture(payload);
      return;
    }
    const url = search.save ?? readDraftUrl();
    if (url) onUrl(url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function Home() {
  const navigate = Route.useNavigate();

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
      toast.message("Captured page — review and import.");
      return;
    }
    setCapturing(true);
    try {
      const result = await articlesApi.import({
        url: payload.url.trim() || undefined,
        title: payload.title.trim(),
        contentHtml: looksHtml ? payload.html : undefined,
        contentText: looksHtml ? undefined : payload.html,
        capture: looksHtml,
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
        toast.success("Captured — saved to your list");
        goRead(navigate, saved.id);
      } catch (err) {
        console.error("[capture] persist failed:", err);
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
      toast.message("Captured page — review and import.");
    } finally {
      setCapturing(false);
    }
  }

  return (
    <AppShell active="home" onOpenItem={openItem}>
      <PendingCapturePickup
        onCapture={(payload) => void autoImportCapture(payload)}
        onUrl={(url) => {
          save.setUrl(url);
          void save.save(url, true);
        }}
      />
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
        <WeeklyRecap />
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
