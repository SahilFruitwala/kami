import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { addTransitionType, startTransition } from "react";
import { AppShell } from "@/components/app-shell.tsx";
import { KamiEyebrow } from "@/components/kami.tsx";
import type { LibraryItem } from "@/lib/store.ts";
import { AccountCard } from "@/components/settings/account-card.tsx";
import { AppearanceCard } from "@/components/settings/appearance-card.tsx";
import { ReadingCard } from "@/components/settings/reading-card.tsx";
import { CaptureCard } from "@/components/settings/capture-card.tsx";
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
        <section className="w-full bg-paper/60 backdrop-blur-sm">
          <div className="mx-auto w-full max-w-7xl px-4 pt-8 pb-6 sm:px-6 lg:px-12">
            <KamiEyebrow>
              Reading Room Rules
              <span className="size-1 rounded-full bg-hanko/40" aria-hidden="true" />
              <span className="text-bamboo">Account · Appearance · Organize · Data · Help</span>
            </KamiEyebrow>
            <h2 className="mt-2 font-display text-3xl tracking-tight text-ink">Settings</h2>
            <p className="mt-2 max-w-xl font-body text-sm leading-relaxed text-ink-soft">
              Full controls live here. Compact versions stay inline in the reader and
              library — both write to the same preferences.
            </p>
            <nav aria-label="Settings sections" className="mt-4 flex flex-wrap gap-2 font-sans text-xs">
              {[
                ["#account", "Account"],
                ["#appearance", "Appearance"],
                ["#reading", "Reading & audio"],
                ["#capture", "Capture"],
                ["#organize", "Organize"],
                ["#data", "Data"],
                ["#help", "Help"],
              ].map(([href, label]) => (
                <a key={href} href={href} className="rounded-[0.25rem] bg-surface px-3 py-1.5 text-ink-soft shadow-[var(--shadow-border)] transition-colors hover:bg-paper-warm hover:text-ink">
                  {label}
                </a>
              ))}
            </nav>
          </div>
        </section>

        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-10 sm:px-6 lg:px-12">
          <AccountCard />
          <AppearanceCard />
          <ReadingCard />
          <CaptureCard />
          <OrganizeCard />
          <DataCard />
          <HelpCard />
        </div>
    </AppShell>
  );
}
