import { createFileRoute } from "@tanstack/react-router";
import { addTransitionType, startTransition } from "react";
import { Rss } from "lucide-react";
import { AppShell } from "@/components/app-shell.tsx";
import { GlossHeader } from "@/components/gloss/primitives.tsx";
import { FeedsView } from "@/components/feeds/feeds-view.tsx";
import type { FeedEntryView } from "@/lib/api/feeds";
import type { LibraryItem } from "@/lib/library-item.ts";

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
      <GlossHeader
        icon={<Rss className="size-4" aria-hidden="true" />}
        eyebrow="Feeds & newsletters"
        title="Your feeds"
        description="Everything you follow, in one quiet stream. Skim here; save what deserves a proper read."
      />

      <div className="mx-auto w-full max-w-[1200px] px-4 pt-8 pb-10 sm:px-8">
        <FeedsView
          feedId={search.feed ?? null}
          view={search.view ?? "unread"}
          onSelectFeed={(feed) =>
            void navigate({
              search: (prev: FeedsSearch) => ({ ...prev, feed: feed ?? undefined }),
              replace: true,
            })
          }
          onView={(view) =>
            void navigate({
              search: (prev: FeedsSearch) => ({
                ...prev,
                view: view === "unread" ? undefined : view,
              }),
              replace: true,
            })
          }
          onOpenItem={openItem}
        />
      </div>
    </AppShell>
  );
}
