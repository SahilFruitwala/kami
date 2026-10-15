import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { addTransitionType, startTransition, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AppGate, LibraryGate } from "@/components/app-gate.tsx";
import { DirectionalTransition } from "@/components/directional-transition.tsx";
import { ReaderView } from "@/components/reader-view.tsx";
import { articlesApi } from "@/lib/api/articles";
import { libraryApi } from "@/lib/api/library";
import { articleToItem, itemToArticle, useLibraryStore, type LibraryItem } from "@/lib/store.ts";

type ReadSearch = {
  id?: string;
};

/**
 * True for link-only stub bodies: empty, or the "Saved as a link" placeholder
 * written by `articleFromLinkOnly` in extract.server.ts. Both upgrade to a
 * clean copy when the reader opens the work.
 */
function isStubBody(html: string): boolean {
  return !html.trim() || html.includes("Saved as a link.");
}

export const Route = createFileRoute("/read")({
  validateSearch: (search: Record<string, unknown>): ReadSearch => ({
    id: typeof search.id === "string" && search.id.length > 0 ? search.id : undefined,
  }),
  component: ReadPage,
});

function ReadPage() {
  return (
    <AppGate>
      <LibraryGate>
        <DirectionalTransition>
          <Read />
        </DirectionalTransition>
      </LibraryGate>
    </AppGate>
  );
}

function Read() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const fetchedFor = useRef<string | null>(null);
  const [fetchError, setFetchError] = useState("");

  const openItem = useLibraryStore((s) =>
    search.id ? (s.library.find((row) => row.id === search.id) ?? null) : null,
  );
  const archiveItem = useLibraryStore((s) => s.archiveItem);
  const upsertItem = useLibraryStore((s) => s.upsertItem);

  const article = openItem?.contentHtml ? itemToArticle(openItem) : null;

  // Lean boot omits bodies — load from DB first; then upgrade link-only stubs
  // to a clean copy. A stub is an empty body _or_ the "Saved as a link"
  // placeholder written by articleFromLinkOnly (bulk saves used to store that
  // placeholder, which blocked the upgrade and left X links unreadable).
  // When extraction fails for a placeholder row, the stored placeholder stays
  // on screen so its "Open original" fallback is preserved.
  useEffect(() => {
    if (!openItem || !isStubBody(openItem.contentHtml)) return;
    if (fetchedFor.current === openItem.id) return;
    fetchedFor.current = openItem.id;
    setFetchError("");
    void (async () => {
      try {
        const fromDb = await libraryApi.items.get(openItem.id);
        if (fromDb?.contentHtml && !isStubBody(fromDb.contentHtml)) {
          upsertItem(fromDb, { sync: false });
          return;
        }
        const result = await articlesApi.extract(openItem.url);
        if (!result.ok) {
          if (!openItem.contentHtml.trim()) setFetchError(result.error);
          return;
        }
        // Keep the stub's identity (id/savedAt) for the upgraded row: X
        // canonical URLs often differ in host (twitter.com vs x.com), and a
        // fresh id would orphan this open reader (`?id=` would no longer
        // resolve, including after refresh).
        const upgraded: LibraryItem = {
          ...articleToItem(result.article),
          id: openItem.id,
          savedAt: openItem.savedAt,
        };
        upsertItem(upgraded);
      } catch {
        if (!openItem.contentHtml.trim()) {
          setFetchError("Something went wrong while reading that page. Try again.");
        }
      }
    })();
  }, [openItem, upsertItem]);

  function goLibrary() {
    startTransition(() => {
      addTransitionType("nav-back");
      void navigate({ to: "/library" });
    });
  }

  function openNext(item: LibraryItem) {
    startTransition(() => {
      addTransitionType("nav-forward");
      void navigate({ to: "/read", search: { id: item.id } });
    });
  }

  if (!search.id || !openItem) {
    const noScroll = !search.id;
    return (
      <main className="kami-desk flex min-h-dvh items-center justify-center px-6">
        <div className="kami-sheet-raised flex max-w-md flex-col items-center gap-3 p-10 text-center">
          <h1 className="font-display text-3xl leading-tight text-ink text-balance">
            {noScroll ? "Nothing open" : "Not on the shelf"}
          </h1>
          <p className="font-body text-sm text-ink-muted">
            {noScroll
              ? "Choose a work from the Library and it will open here for quiet reading."
              : "This work may have been removed. Return to the library to keep reading."}
          </p>
          <button type="button" onClick={goLibrary} className="g-btn g-btn--ink mt-3">
            Back to Library
          </button>
        </div>
      </main>
    );
  }

  if (!article) {
    return (
      <main className="kami-desk flex min-h-dvh items-center justify-center px-6">
        <div
          className="kami-sheet-raised flex max-w-md flex-col items-center gap-3 p-10 text-center"
          role={fetchError ? "alert" : "status"}
          aria-live="polite"
        >
          <h1 className="font-display text-3xl leading-tight text-balance text-ink">
            {openItem.title}
          </h1>
          {openItem.author ? (
            <p className="font-display text-[17px] text-ink-soft italic">{openItem.author}</p>
          ) : null}
          {fetchError ? (
            <p className="font-sans text-sm text-ink-muted">{fetchError}</p>
          ) : (
            <p className="mt-2 flex items-center gap-2 font-sans text-sm text-ink-muted">
              <span
                className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent"
                aria-hidden="true"
              />
              Bringing it in
            </p>
          )}
          {fetchError ? (
            <button type="button" onClick={goLibrary} className="g-btn g-btn--ink mt-3">
              Back to Library
            </button>
          ) : null}
        </div>
      </main>
    );
  }

  return (
    <ReaderView
      item={openItem}
      article={article}
      onBack={goLibrary}
      onOpenItem={openNext}
      onArchive={() => {
        archiveItem(openItem.id, !openItem.archived);
        if (!openItem.archived) {
          goLibrary();
          toast.success("Archived");
        } else {
          toast.success("Moved to inbox");
        }
      }}
    />
  );
}
