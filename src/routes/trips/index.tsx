import { createFileRoute } from "@tanstack/react-router";
import { addTransitionType, startTransition } from "react";
import { AppShell } from "@/components/app-shell.tsx";
import { KamiEyebrow } from "@/components/kami.tsx";
import { TripsList } from "@/components/trips/trips-list.tsx";
import type { LibraryItem } from "@/lib/store.ts";

export const Route = createFileRoute("/trips/")({
  component: TripsPage,
});

function TripsPage() {
  const navigate = Route.useNavigate();

  function openItem(item: LibraryItem) {
    startTransition(() => {
      addTransitionType("nav-forward");
      void navigate({ to: "/read", search: { id: item.id } });
    });
  }

  return (
    <AppShell active="trips" onOpenItem={openItem}>
      <section className="w-full bg-paper/60 backdrop-blur-sm">
        <div className="mx-auto w-full max-w-7xl px-4 pt-8 pb-6 sm:px-6 lg:px-12">
          <KamiEyebrow>Trips</KamiEyebrow>
          <h2 className="mt-2 font-display text-3xl tracking-tight text-ink">The Route Book</h2>
          <p className="mt-2 max-w-xl font-body text-sm leading-relaxed text-ink-soft">
            Plan a trip one piece at a time: where you stay, and what each day holds.
          </p>
        </div>
      </section>

      <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-12">
        <TripsList
          onCreated={(trip) => void navigate({ to: "/trips/$id", params: { id: trip.id } })}
        />
      </div>
    </AppShell>
  );
}
