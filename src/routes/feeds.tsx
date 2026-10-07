import { createFileRoute } from "@tanstack/react-router";
import { addTransitionType, startTransition } from "react";
import { AppShell } from "@/components/app-shell.tsx";
import { FeedsView } from "@/components/feeds/feeds-view.tsx";
import { KamiEyebrow } from "@/components/kami.tsx";
import type { FeedEntryView } from "@/lib/api/feeds";
import type { LibraryItem } from "@/lib/store.ts";

type FeedsSearch = { feed?: string; view?: FeedEntryView };

export const Route = createFileRoute("/feeds")({
  validateSearch: (search: Record<string, unknown>): FeedsSearch => ({
    feed: typeof search.feed === "string" ? search.feed : undefined,
    view: search.view === "all" || search.view === "saved" ? search.view : undefined,
  }),
  component: FeedsPage,
});

function FeedsPage() {
  const navigate = Route.useNavigate();
  const search = Route.useSearch();

  function openItem(item: LibraryItem) {
    startTransition(() => {
      addTransitionType("nav-forward");
      void navigate({ to: "/read", search: { id: item.id } });
    });
  }

  return (
    <AppShell active="feeds" onOpenItem={openItem}>
      <section className="w-full bg-paper/60 backdrop-blur-sm">
        <div className="mx-auto w-full max-w-7xl px-4 pt-8 pb-6 sm:px-6 lg:px-12">
          <KamiEyebrow>Feeds &amp; Newsletters</KamiEyebrow>
          <h2 className="mt-2 font-display text-3xl tracking-tight text-ink">The Morning Post</h2>
          <p className="mt-2 max-w-xl font-body text-sm leading-relaxed text-ink-soft">
            Everything you follow, in one quiet stream. Skim here; save what deserves a proper read.
          </p>
        </div>
      </section>

      <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-12">
        <FeedsView
          feedId={search.feed ?? null}
          view={search.view ?? "unread"}
          onSelectFeed={(feed) =>
            void navigate({
              search: (prev) => ({ ...prev, feed: feed ?? undefined }),
              replace: true,
            })
          }
          onView={(view) =>
            void navigate({
              search: (prev) => ({ ...prev, view: view === "unread" ? undefined : view }),
              replace: true,
            })
          }
          onOpenItem={openItem}
        />
      </div>
    </AppShell>
  );
}
