import { lazy, Suspense, useEffect, useState } from "react";
import { toast } from "sonner";
import { AppGate } from "@/components/app-gate.tsx";
import { DirectionalTransition } from "@/components/directional-transition.tsx";
import { ToolsDialog } from "@/components/library/library-dialogs.tsx";
import { SiteFooter } from "@/components/library/widgets.tsx";
import { NameOnboarding } from "@/components/name-onboarding.tsx";
import { SiteHeader, type SitePane } from "@/components/site-header.tsx";
import { useCaptureTools } from "@/hooks/use-capture-tools.ts";
import {
  flushSyncOutbox,
  pendingSyncCount,
  subscribeOutbox,
} from "@/lib/library-remote.ts";
import type { LibraryItem } from "@/lib/store.ts";

// ⌘K palette is heavy (~600 lines + shelf lookup hooks) and unused until
// opened — keep it out of the initial authenticated shell chunk.
const CommandPalette = lazy(() =>
  import("@/components/library/command-palette.tsx").then((m) => ({
    default: m.CommandPalette,
  })),
);

/**
 * Shared sanctuary shell: skip link, Sanctuary sidebar + utility bar,
 * footer, capture-tools dialog, command palette, and the offline/sync
 * banner. Used by Home, Library, Shelves, Journal, Vault, and Settings so
 * chrome stays identical everywhere. Layout mirrors the Stitch Sanctuary
 * design: fixed left sidebar on desktop, bottom tab bar on mobile.
 */
export function AppShell({
  active,
  onOpenItem,
  children,
}: {
  active: SitePane;
  onOpenItem: (item: LibraryItem) => void;
  children: React.ReactNode;
}) {
  const tools = useCaptureTools();

  return (
    <AppGate>
      <DirectionalTransition>
        <main id="main" className="kami-desk relative flex min-h-dvh flex-col overflow-x-hidden [touch-action:manipulation]">
          <a href="#main" className="sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:top-2 focus-visible:left-2 focus-visible:z-50 focus-visible:rounded-md focus-visible:bg-ink focus-visible:px-4 focus-visible:py-2 focus-visible:text-sm focus-visible:text-paper">Skip to content</a>
          <SiteHeader active={active} onOpenTools={() => tools.setToolsOpen(true)} />
          <div className="flex-1 pb-[calc(3rem+env(safe-area-inset-bottom))] lg:pl-60 lg:pb-0">{children}</div>
          <div className="pb-[calc(3rem+env(safe-area-inset-bottom))] lg:pl-60 lg:pb-0">
            <SiteFooter />
          </div>
          <ToolsDialog
            open={tools.toolsOpen}
            onOpenChange={tools.setToolsOpen}
            bookmarklet={tools.bookmarklet}
          />
          <Suspense fallback={null}>
            <CommandPalette onOpenItem={onOpenItem} />
          </Suspense>
          <NameOnboarding />
          <OfflineBanner />
        </main>
      </DirectionalTransition>
    </AppGate>
  );
}

/** Fixed pill: offline state + pending-sync count with manual retry. */
function OfflineBanner() {
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [pending, setPending] = useState(pendingSyncCount);
  const [flushing, setFlushing] = useState(false);

  useEffect(() => {
    const goOnline = () => {
      setOnline(true);
      toast.success("Back online — syncing changes");
    };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    const unsub = subscribeOutbox(setPending);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      unsub();
    };
  }, []);

  if (online && pending === 0) return null;

  async function retry() {
    setFlushing(true);
    try {
      const { done, failed } = await flushSyncOutbox();
      if (failed > 0) toast.error(`${failed} changes still waiting — try again later`);
      else if (done > 0) toast.success(`Synced ${done} ${done === 1 ? "change" : "changes"}`);
    } finally {
      setFlushing(false);
    }
  }

  return (
    <div
      className="fixed right-[max(1rem,env(safe-area-inset-right))] bottom-[calc(4rem+env(safe-area-inset-bottom))] z-50 flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-2xl bg-ink py-2 pr-2 pl-4 text-paper shadow-[var(--shadow-raised)] lg:bottom-[max(1rem,env(safe-area-inset-bottom))] lg:rounded-full"
      role={online ? "status" : "alert"}
    >
      <span className="flex items-center gap-2 font-sans text-xs">
        <span
          className={online ? "size-2 rounded-full bg-ok" : "size-2 animate-pulse rounded-full bg-shu"}
          aria-hidden="true"
        />
        {!online
          ? "You're offline — changes save here and sync on reconnect"
          : `${pending} ${pending === 1 ? "change" : "changes"} waiting to sync`}
      </span>
      {online && pending > 0 ? (
        <button
          type="button"
          onClick={() => void retry()}
          disabled={flushing}
          className="shrink-0 rounded-full bg-paper px-3 py-1 font-sans text-xs font-semibold text-ink disabled:opacity-60"
        >
          {flushing ? "Syncing…" : "Retry"}
        </button>
      ) : null}
    </div>
  );
}
