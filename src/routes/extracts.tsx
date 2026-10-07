import { createFileRoute } from "@tanstack/react-router";
import { addTransitionType, startTransition } from "react";
import { AppShell } from "@/components/app-shell.tsx";
import { ExtractsView } from "@/components/extracts/extracts-view.tsx";
import { KamiEyebrow } from "@/components/kami.tsx";
import type { LibraryItem } from "@/lib/store.ts";

type ExtractsSearch = { source?: string };

export const Route = createFileRoute("/extracts")({
  validateSearch: (search: Record<string, unknown>): ExtractsSearch => ({
    source: typeof search.source === "string" ? search.source : undefined,
  }),
  component: ExtractsPage,
});

function ExtractsPage() {
  const navigate = Route.useNavigate();
  const search = Route.useSearch();

  function openItem(item: LibraryItem) {
    startTransition(() => {
      addTransitionType("nav-forward");
      void navigate({ to: "/read", search: { id: item.id } });
    });
  }

  return (
    <AppShell active="extracts" onOpenItem={openItem}>
      <section className="w-full bg-paper/60 backdrop-blur-sm">
        <div className="mx-auto w-full max-w-7xl px-4 pt-8 pb-6 sm:px-6 lg:px-12">
          <KamiEyebrow>Extracts · Firecrawl</KamiEyebrow>
          <h2 className="mt-2 font-display text-3xl tracking-tight text-ink">The Clipping Desk</h2>
          <p className="mt-2 max-w-xl font-body text-sm leading-relaxed text-ink-soft">
            Ask any page for exactly what you need. Review each answer; keep the ones worth keeping.
          </p>
        </div>
      </section>

      <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-12">
        <ExtractsView
          sourceId={search.source ?? null}
          onSelect={(id) =>
            void navigate({
              search: (prev) => ({ ...prev, source: id ?? undefined }),
              replace: true,
            })
          }
        />
      </div>
    </AppShell>
  );
}
