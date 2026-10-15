import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { addTransitionType, startTransition } from "react";
import { Settings as SettingsIcon } from "lucide-react";
import { AppShell } from "@/components/app-shell.tsx";
import { GlossHeader } from "@/components/gloss/primitives.tsx";
import type { LibraryItem } from "@/lib/store.ts";
import { AccountCard } from "@/components/settings/account-card.tsx";
import { AppearanceCard } from "@/components/settings/appearance-card.tsx";
import { ReadingCard } from "@/components/settings/reading-card.tsx";
import { CaptureCard } from "@/components/settings/capture-card.tsx";
import { AutoOrganizeCard } from "@/components/settings/auto-organize-card.tsx";
import { OrganizeCard } from "@/components/settings/organize-card.tsx";
import { DataCard } from "@/components/settings/data-card.tsx";
import { HelpCard } from "@/components/settings/help-card.tsx";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  return <Settings />;
}

function Settings() {
  const navigate = useNavigate();

  function openItem(item: LibraryItem) {
    startTransition(() => {
      addTransitionType("nav-forward");
      void navigate({ to: "/read", search: { id: item.id } });
    });
  }

  return (
    <AppShell active="settings" onOpenItem={openItem}>
      <GlossHeader
        icon={<SettingsIcon className="size-4" aria-hidden="true" />}
        eyebrow="Reading room"
        title="Settings"
        description="Full controls live here. Compact versions stay inline in the reader and library; both write to the same preferences."
      >
        <nav aria-label="Settings sections" className="mt-8 flex flex-wrap gap-2">
          {[
            ["#account", "Account"],
            ["#appearance", "Appearance"],
            ["#reading", "Reading"],
            ["#capture", "Capture"],
            ["#organize", "Organize"],
            ["#data", "Data"],
            ["#help", "Help"],
          ].map(([href, label]) => (
            <a key={href} href={href} className="g-chip px-3.5">
              {label}
            </a>
          ))}
        </nav>
      </GlossHeader>

      <div className="g-stagger mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 pt-8 pb-10 sm:px-8">
        <AccountCard />
        <AppearanceCard />
        <ReadingCard />
        <CaptureCard />
        <OrganizeCard />
        <AutoOrganizeCard />
        <DataCard />
        <HelpCard />
      </div>
    </AppShell>
  );
}
