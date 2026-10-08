import { createFileRoute, Link } from "@tanstack/react-router";
import { addTransitionType, startTransition } from "react";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/app-shell.tsx";
import { TripBoard } from "@/components/trips/trip-board.tsx";
import type { LibraryItem } from "@/lib/store.ts";

export const Route = createFileRoute("/trips/$id")({
  component: TripPage,
});

function TripPage() {
  const { id } = Route.useParams();
  const navigate = Route.useNavigate();

  function openItem(item: LibraryItem) {
    startTransition(() => {
      addTransitionType("nav-forward");
      void navigate({ to: "/read", search: { id: item.id } });
    });
  }

  return (
    <AppShell active="trips" onOpenItem={openItem}>
      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-12">
        <Link
          to="/trips"
          className="mb-6 inline-flex items-center gap-1.5 font-sans text-xs text-ink-soft hover:text-hanko"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          All trips
        </Link>
        <TripBoard key={id} tripId={id} onDeleted={() => void navigate({ to: "/trips" })} />
      </div>
    </AppShell>
  );
}
