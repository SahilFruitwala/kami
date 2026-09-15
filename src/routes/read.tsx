import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { addTransitionType, startTransition, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AppGate } from "@/components/app-gate.tsx";
import { DirectionalTransition } from "@/components/directional-transition.tsx";
import { ReaderView } from "@/components/reader-view.tsx";
import { extractArticle } from "@/lib/article-fns.ts";
import {
  articleToItem,
  itemToArticle,
  useLibraryStore,
  type LibraryItem,
} from "@/lib/store.ts";

type ReadSearch = {
  id?: string;
};

export const Route = createFileRoute("/read")({
  validateSearch: (search: Record<string, unknown>): ReadSearch => ({
    id: typeof search.id === "string" && search.id.length > 0 ? search.id : undefined,
  }),
  component: ReadPage,
});

function ReadPage() {
  return (
    <AppGate>
      <DirectionalTransition>
        <Read />
      </DirectionalTransition>
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

  // Works saved as link-only have no clean copy yet — fetch it in place.
  useEffect(() => {
    if (!openItem || openItem.contentHtml) return;
    if (fetchedFor.current === openItem.id) return;
    fetchedFor.current = openItem.id;
    setFetchError("");
    void (async () => {
      try {
        const result = await extractArticle({ data: { url: openItem.url } });
        if (!result.ok) {
          setFetchError(result.error);
          return;
        }
        upsertItem(articleToItem(result.article));
      } catch {
        setFetchError("Something went wrong while reading that page. Try again.");
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
    return (
      <main className="kami-desk flex min-h-dvh items-center justify-center px-6">
        <div className="kami-sheet flex max-w-sm flex-col items-center gap-3 p-8 text-center">
          <h1 className="font-display text-2xl text-ink text-balance">Scroll Not Found</h1>
          <p className="font-body text-sm text-ink-muted">
            This work may have been removed. Return to the library to keep reading.
          </p>
          <button
            type="button"
            onClick={goLibrary}
            className="mt-2 rounded-[0.25rem] bg-hanko px-5 py-2.5 font-sans text-sm font-semibold text-white shadow-sm hover:bg-shu"
          >
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
          className="kami-sheet flex max-w-sm flex-col items-center gap-3 p-8 text-center"
          role={fetchError ? "alert" : "status"}
          aria-live="polite"
        >
          <h1 className="font-display text-2xl text-balance text-ink">{openItem.title}</h1>
          {!fetchError ? (
            <div className="h-4 w-2/3 animate-pulse rounded-full bg-paper-warm" aria-hidden="true" />
          ) : null}
          <p className="font-body text-sm text-ink-muted">
            {fetchError || "Preparing a clean copy…"}
          </p>
          {fetchError ? (
            <button
              type="button"
              onClick={goLibrary}
              className="mt-2 rounded-[0.25rem] bg-hanko px-5 py-2.5 font-sans text-sm font-semibold text-white shadow-sm hover:bg-shu"
            >
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
