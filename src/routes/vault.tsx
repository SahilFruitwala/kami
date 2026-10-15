import { createFileRoute } from "@tanstack/react-router";
import { addTransitionType, startTransition, useState } from "react";
import { Bookmark } from "lucide-react";
import { AppShell } from "@/components/app-shell.tsx";
import { GlossHeader } from "@/components/gloss/primitives.tsx";
import { TranscribeDialog } from "@/components/library/library-dialogs.tsx";
import { VaultView } from "@/components/library/vault-view.tsx";
import { useDeskStats } from "@/hooks/use-desk-stats.ts";
import type { LibraryItem } from "@/lib/library-item.ts";

type VaultSearch = {
  mode?: string;
  sort?: string;
  tag?: string;
  author?: string;
  q?: string;
};

export const Route = createFileRoute("/vault")({
  validateSearch: (search: Record<string, unknown>): VaultSearch => ({
    mode: typeof search.mode === "string" ? search.mode : undefined,
    sort: typeof search.sort === "string" ? search.sort : undefined,
    tag: typeof search.tag === "string" ? search.tag : undefined,
    author: typeof search.author === "string" ? search.author : undefined,
    q: typeof search.q === "string" ? search.q : undefined,
  }),
  component: VaultPage,
});

function VaultPage() {
  return <Vault />;
}

function Vault() {
  const navigate = Route.useNavigate();
  const search = Route.useSearch();
  const stats = useDeskStats();
  const [transcribeOpen, setTranscribeOpen] = useState(false);

  function openItem(item: LibraryItem) {
    startTransition(() => {
      addTransitionType("nav-forward");
      void navigate({ to: "/read", search: { id: item.id } });
    });
  }

  return (
    <AppShell active="vault" onOpenItem={openItem} requireLibrary>
      <GlossHeader
        icon={<Bookmark className="size-4" aria-hidden="true" />}
        eyebrow="Highlight vault"
        title="Your vault"
        description="Every passage you marked — filter by theme or voice, copy them out, or export the lot."
        stats={[
          { value: stats.vaultCount, label: stats.vaultCount === 1 ? "highlight" : "highlights" },
        ]}
      />

      <div className="mx-auto w-full max-w-[1200px] px-4 pt-8 pb-10 sm:px-8">
        <VaultView
          query=""
          initialMode={search.mode}
          initialSort={search.sort}
          initialTag={search.tag}
          initialAuthor={search.author}
          initialLocalQuery={search.q}
          onParamsChange={(params) => {
            void navigate({
              search: {
                mode: params.mode === "tanzaku" ? undefined : params.mode,
                sort: params.sort === "recent" ? undefined : params.sort,
                tag: params.tag ?? undefined,
                author: params.author ?? undefined,
                q: params.q ? params.q : undefined,
              },
              replace: true,
            });
          }}
          onOpenItem={openItem}
          onExitVault={() => void navigate({ to: "/app" })}
          onTranscribe={() => setTranscribeOpen(true)}
        />
      </div>

      <TranscribeDialog open={transcribeOpen} onOpenChange={setTranscribeOpen} />
    </AppShell>
  );
}
