import { createFileRoute } from "@tanstack/react-router";
import { addTransitionType, startTransition } from "react";
import { ScanSearch } from "lucide-react";
import { AppShell } from "@/components/app-shell.tsx";
import { GlossHeader } from "@/components/gloss/primitives.tsx";
import { ExtractsView } from "@/components/extracts/extracts-view.tsx";
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
      <GlossHeader
        icon={<ScanSearch className="size-4" aria-hidden="true" />}
        eyebrow="Clipping desk"
        title="Extracts"
        description="Ask any page for exactly what you need. Review each answer; keep the ones worth keeping."
      />

      <div className="mx-auto w-full max-w-[1200px] px-4 pt-8 pb-10 sm:px-8">
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
