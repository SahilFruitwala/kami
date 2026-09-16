import { createFileRoute } from "@tanstack/react-router";
import { addTransitionType, startTransition, useState } from "react";
import { AppShell } from "@/components/app-shell.tsx";
import { TranscribeDialog } from "@/components/library/library-dialogs.tsx";
import { VaultView } from "@/components/library/vault-view.tsx";
import { KamiEyebrow } from "@/components/kami.tsx";
import { useDeskStats } from "@/components/library/widgets.tsx";
import type { LibraryItem } from "@/lib/store.ts";

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
    <AppShell active="vault" onOpenItem={openItem}>
      <section className="w-full bg-paper/60 backdrop-blur-sm">
        <div className="mx-auto w-full max-w-7xl px-4 pt-8 pb-6 sm:px-6 lg:px-12">
          <KamiEyebrow>
            Highlight Vault
            <span className="size-1 rounded-full bg-hanko/40" aria-hidden="true" />
            <span className="text-bamboo">{stats.vaultCount} slips pressed</span>
          </KamiEyebrow>
          <h2 className="mt-2 font-display text-3xl tracking-tight text-ink">
            Every Passage You Inked
          </h2>
          <p className="mt-2 max-w-xl font-body text-sm leading-relaxed text-ink-soft">
            Highlights pressed onto washi slips — filter by theme or voice,
            cite them into your journal, or export the whole vault.
          </p>
        </div>
      </section>

      <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-12">
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

      <TranscribeDialog
        open={transcribeOpen}
        onOpenChange={setTranscribeOpen}
      />
    </AppShell>
  );
}
