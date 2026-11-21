import { createFileRoute } from "@tanstack/react-router";
import { addTransitionType, startTransition, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell.tsx";
import { PasteDialog } from "@/components/library/library-dialogs.tsx";
import { TodayHabits } from "@/components/compass/today-habits.tsx";
import { TodayDate, TodayDesk, enter } from "@/components/home/today-desk.tsx";
import { useDeskStats } from "@/hooks/use-desk-stats.ts";
import { useCurrentUser } from "@/lib/auth/use-current-user.ts";
import { usePasteImport } from "@/hooks/use-paste-import.ts";
import { articlesApi } from "@/lib/api/articles";
import type { BookmarkletPayload } from "@/lib/bookmarklet.ts";
import { readDraftUrl, takeStashedCapturePayload, writeDraftUrl } from "@/lib/session-article.ts";
import { persistArticleItem } from "@/lib/library-remote.ts";
import { articleToItem, type LibraryItem } from "@/lib/library-item.ts";
import { toastError } from "@/lib/errors";

type HomeSearch = {
  /**
   * URL handed over by the share sheet (`/share`) or the extension's "Save
   * link" menu. It is only *pre-filled*: any site can link here, so saving
   * always takes the reader's own tap on Save.
   */
  save?: string;
};

export const Route = createFileRoute("/app")({
  validateSearch: (search: Record<string, unknown>): HomeSearch => ({
    save: typeof search.save === "string" && search.save.length > 0 ? search.save : undefined,
  }),
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
  // park it as the draft, which <PendingCapturePickup /> pre-fills once signed in.
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
 * bookmarklet/extension (stashed by `/capture`, which only accepts it from
 * the article's own origin or the extension), or a URL from the share sheet
 * or an interrupted save (pre-filled, never saved without a tap). Rendered inside <AppShell>, so it only mounts
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

function greeting(name: string | null, now = new Date()) {
  const h = now.getHours();
  const part =
    h < 5 ? "Still up" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  const first = name?.trim().split(/\s+/)[0];
  return first ? (
    <>
      {part},<br />
      <em>{first}.</em>
    </>
  ) : (
    `${part}.`
  );
}

function Home() {
  const navigate = Route.useNavigate();
  const user = useCurrentUser();
  const waiting = useDeskStats().inbox;

  const openOnSave = (id: string | null) => {
    if (id) goRead(navigate, id);
  };
  const paste = usePasteImport(openOnSave);

  const [capturing, setCapturing] = useState(false);

  function openItem(item: LibraryItem) {
    goRead(navigate, item.id);
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
          toastError(err, "Could not save that capture.");
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
          // Hand the link to Add (the palette), pre-filled: saving still takes the
          // reader's own Enter, never an automatic save.
          window.dispatchEvent(new CustomEvent("kami:open-palette", { detail: { query: url } }));
        }}
      />
      <div className="rd-view rd-home">
        <div className="rd-home-head rd-enter" style={enter(0)}>
          <div>
            <p className="rd-eyebrow">Your reading desk</p>
            <h1 className="rd-display">{greeting(user?.displayName ?? null)}</h1>
          </div>
          <TodayDate waiting={waiting} />
        </div>
        {capturing ? (
          <p className="mt-3 text-sm text-ink-muted" role="status" aria-live="polite">
            Importing captured page…
          </p>
        ) : null}
        <div style={{ marginTop: 32 }}>
          <TodayHabits />
        </div>
        <TodayDesk />
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
