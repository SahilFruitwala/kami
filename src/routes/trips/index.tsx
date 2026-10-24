import { createFileRoute } from "@tanstack/react-router";
import { addTransitionType, startTransition } from "react";
import { Plane } from "lucide-react";
import { AppShell } from "@/components/app-shell.tsx";
import { GlossHeader } from "@/components/gloss/primitives.tsx";
import { TripsList } from "@/components/trips/trips-list.tsx";
import type { LibraryItem } from "@/lib/library-item.ts";

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
      <GlossHeader
        icon={<Plane className="size-4" aria-hidden="true" />}
        eyebrow="Route book"
        title="Your trips"
        description="Plan a trip one piece at a time: where you stay, and what each day holds. Mark where it stands as you go."
      />

      <div className="mx-auto w-full max-w-[1200px] px-4 pt-8 pb-10 sm:px-8">
        <TripsList
          onCreated={(trip) => void navigate({ to: "/trips/$id", params: { id: trip.id } })}
        />
      </div>
    </AppShell>
  );
}
