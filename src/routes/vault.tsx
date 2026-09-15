import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { addTransitionType, startTransition, useState } from "react";
import { AppGate } from "@/components/app-gate.tsx";
import { DirectionalTransition } from "@/components/directional-transition.tsx";
import { ToolsDialog, TranscribeDialog } from "@/components/library/library-dialogs.tsx";
import { CommandPalette } from "@/components/library/command-palette.tsx";
import { VaultView } from "@/components/library/vault-view.tsx";
import { SiteFooter } from "@/components/library/widgets.tsx";
import { SiteHeader } from "@/components/site-header.tsx";
import { KamiEyebrow } from "@/components/kami.tsx";
import { useCaptureTools } from "@/hooks/use-capture-tools.ts";
import { useDeskStats } from "@/components/library/widgets.tsx";
import type { LibraryItem } from "@/lib/store.ts";

export const Route = createFileRoute("/vault")({
  component: VaultPage,
});

function VaultPage() {
  return (
    <AppGate>
      <DirectionalTransition>
        <Vault />
      </DirectionalTransition>
    </AppGate>
  );
}

function Vault() {
  const navigate = useNavigate();
  const tools = useCaptureTools();
  const stats = useDeskStats();
  const [transcribeOpen, setTranscribeOpen] = useState(false);

  function openItem(item: LibraryItem) {
    startTransition(() => {
      addTransitionType("nav-forward");
      void navigate({ to: "/read", search: { id: item.id } });
    });
  }

  return (
    <main id="main" className="kami-desk relative flex min-h-dvh flex-col overflow-x-hidden [touch-action:manipulation]">
      <a href="#main" className="sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:top-2 focus-visible:left-2 focus-visible:z-50 focus-visible:rounded-md focus-visible:bg-ink focus-visible:px-4 focus-visible:py-2 focus-visible:text-sm focus-visible:text-paper">Skip to content</a>
      <SiteHeader active="vault" onOpenTools={() => tools.setToolsOpen(true)} />

      <div className="flex-1">
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
          onOpenItem={openItem}
          onExitVault={() => void navigate({ to: "/" })}
          onTranscribe={() => setTranscribeOpen(true)}
        />
      </div>
      </div>

      <SiteFooter />
      <TranscribeDialog
        open={transcribeOpen}
        onOpenChange={setTranscribeOpen}
      />
      <ToolsDialog
        open={tools.toolsOpen}
        onOpenChange={tools.setToolsOpen}
        bookmarklet={tools.bookmarklet}
      />
      <CommandPalette onOpenItem={openItem} />
    </main>
  );
}
