import { useTrip, useTripActions } from "@/hooks/use-trips.ts";
import { errorMessage } from "@/lib/errors";
import { TripDetails } from "./trip-details.tsx";
import { Hotels } from "./trip-hotels.tsx";
import { Itinerary } from "./trip-itinerary.tsx";

export function TripBoard({ tripId, onDeleted }: { tripId: string; onDeleted: () => void }) {
  const query = useTrip(tripId);
  const actions = useTripActions(tripId);

  if (query.isPending) {
    return <div className="kami-sheet h-60 animate-pulse opacity-60" aria-hidden="true" />;
  }
  if (query.isError) {
    return (
      <p className="kami-sheet p-6 font-body text-sm text-ink-soft">
        {errorMessage(query.error, "Could not load this trip.")}
      </p>
    );
  }
  const trip = query.data;

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <TripDetails trip={trip} actions={actions} onDeleted={onDeleted} />
      <Hotels trip={trip} actions={actions} />
      <Itinerary trip={trip} actions={actions} />
    </div>
  );
}
