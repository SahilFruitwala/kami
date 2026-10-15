import { lazy, Suspense, useEffect, useState } from "react";
import { toast } from "sonner";
import { AppGate, LibraryGate } from "@/components/app-gate.tsx";
import { DirectionalTransition } from "@/components/directional-transition.tsx";
import { ToolsDialog } from "@/components/library/library-dialogs.tsx";
import { SiteFooter } from "@/components/library/site-footer.tsx";
import { NameOnboarding } from "@/components/name-onboarding.tsx";
import { SiteHeader, type SitePane } from "@/components/site-header.tsx";
import { useCaptureTools } from "@/hooks/use-capture-tools.ts";
import { flushAllSyncQueues, pendingSyncCount, subscribeSyncQueues } from "@/lib/sync-queue.ts";
import type { LibraryItem } from "@/lib/library-item.ts";

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
 * banner. Used by Home, Library, Journal, Vault, Movies, Series, Books,
 * Wishlist, and Settings so chrome stays identical everywhere. Layout
 * mirrors the Stitch Sanctuary design: fixed left sidebar on desktop,
 * bottom tab bar on mobile.
 */
export function AppShell({
  active,
  onOpenItem,
  children,
  requireLibrary,
}: {
  active: SitePane;
  onOpenItem: (item: LibraryItem) => void;
  children: React.ReactNode;
  /**
   * Opt in to blocking `children` on the library boot (Library, Vault).
   * Home / Shelves / Settings omit it so first paint never waits on
   * `getLibrary` — chrome (header/footer/⌘K) always renders immediately and
   * the store fills in underneath.
   */
  requireLibrary?: boolean;
}) {
  const tools = useCaptureTools();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () =>
      typeof window !== "undefined" &&
      window.localStorage.getItem("kami-sidebar-collapsed") === "1",
  );

  function toggleSidebar() {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem("kami-sidebar-collapsed", next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  const contentPad = sidebarCollapsed ? "lg:pl-0" : "lg:pl-60";

  return (
    <AppGate>
      <DirectionalTransition>
        <main
          id="main"
          className="kami-desk relative flex min-h-dvh flex-col overflow-x-hidden [touch-action:manipulation]"
        >
          <a
            href="#main"
            className="sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:top-2 focus-visible:left-2 focus-visible:z-50 focus-visible:rounded-md focus-visible:bg-ink focus-visible:px-4 focus-visible:py-2 focus-visible:text-sm focus-visible:text-paper"
          >
            Skip to content
          </a>
          <SiteHeader
            active={active}
            onOpenTools={() => tools.setToolsOpen(true)}
            sidebarCollapsed={sidebarCollapsed}
            onToggleSidebar={toggleSidebar}
          />
          <div
            className={`flex-1 pb-[calc(3rem+env(safe-area-inset-bottom))] lg:pb-0 ${contentPad} transition-[padding-left] duration-200 motion-reduce:transition-none`}
          >
            {requireLibrary ? <LibraryGate>{children}</LibraryGate> : children}
          </div>
          <div
            className={`pb-[calc(3rem+env(safe-area-inset-bottom))] lg:pb-0 ${contentPad} transition-[padding-left] duration-200 motion-reduce:transition-none`}
          >
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
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
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
    const unsub = subscribeSyncQueues(setPending);
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
      const { done, failed } = await flushAllSyncQueues();
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
          className={
            online ? "size-2 rounded-full bg-ok" : "size-2 animate-pulse rounded-full bg-shu"
          }
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
          className="shrink-0 rounded-full bg-paper px-3 py-1 font-sans text-xs font-semibold text-ink transition-colors hover:bg-paper-warm disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-paper/70"
        >
          {flushing ? "Syncing…" : "Retry"}
        </button>
      ) : null}
    </div>
  );
}
