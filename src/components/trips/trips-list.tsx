import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { BedDouble, CalendarDays, LoaderCircle, MapPin, Plus } from "lucide-react";
import { useCreateTrip, useTripsList } from "@/hooks/use-trips.ts";
import type { Trip } from "@/lib/api/trips";
import { relativeTime } from "@/lib/time.ts";
import { formatRange, MAX_TRIP_DAYS } from "@/lib/trip-days.ts";
import { PrimaryButton, TextInput } from "./trip-fields.tsx";

export function TripsList({ onCreated }: { onCreated: (trip: Trip) => void }) {
  const list = useTripsList();
  const trips = list.data ?? [];

  return (
    <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
      <aside className="lg:sticky lg:top-24 lg:col-span-4 xl:col-span-3">
        <section className="kami-sheet p-4">
          <NewTripForm onCreated={onCreated} />
        </section>
      </aside>

      <div className="min-w-0 lg:col-span-8 xl:col-span-9">
        {list.isPending ? (
          <div className="kami-sheet h-40 animate-pulse opacity-60" aria-hidden="true" />
        ) : list.isError ? (
          <p className="kami-sheet p-6 font-body text-sm text-ink-soft">
            {list.error instanceof Error ? list.error.message : "Could not load your trips."}
          </p>
        ) : trips.length === 0 ? (
          <div className="kami-sheet space-y-2 p-6">
            <p className="font-display text-xl text-ink">No trips yet</p>
            <p className="max-w-prose font-body text-sm leading-relaxed text-ink-soft">
              Start one with just a destination. Dates, hotels and a day-by-day plan can come later,
              a piece at a time.
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {trips.map((t) => (
              <li key={t.id} className="list-none">
                <Link
                  to="/trips/$id"
                  params={{ id: t.id }}
                  className="kami-sheet flex h-full flex-col gap-2 p-4 transition-colors hover:bg-paper-warm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hanko/40"
                >
                  <span className="font-display text-lg leading-tight text-ink">{t.title}</span>
                  <span className="flex items-center gap-1.5 font-sans text-xs text-ink-soft">
                    <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
                    <span className="truncate">{t.destination}</span>
                  </span>
                  <span className="flex items-center gap-1.5 font-sans text-xs text-ink-soft">
                    <CalendarDays className="size-3.5 shrink-0" aria-hidden="true" />
                    {formatRange(t.startDate, t.dayCount)}
                  </span>
                  <span className="flex items-center gap-1.5 font-sans text-xs text-ink-soft">
                    <BedDouble className="size-3.5 shrink-0" aria-hidden="true" />
                    <span className="truncate">
                      {t.chosenHotel ??
                        (t.hotelCount ? `${t.hotelCount} shortlisted` : "No hotel yet")}
                    </span>
                  </span>
                  <span className="mt-auto pt-1 font-sans text-[11px] text-ink-muted">
                    {t.itemCount} {t.itemCount === 1 ? "plan" : "plans"} · updated{" "}
                    {relativeTime(t.updatedAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function NewTripForm({ onCreated }: { onCreated: (trip: Trip) => void }) {
  const create = useCreateTrip();
  const [destination, setDestination] = useState("");
  const [startDate, setStartDate] = useState("");
  const [days, setDays] = useState("3");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (create.isPending || !destination.trim()) return;
    const dayCount = Math.min(MAX_TRIP_DAYS, Math.max(1, Number.parseInt(days, 10) || 3));
    create.mutate(
      { destination: destination.trim(), startDate: startDate || null, dayCount },
      {
        onSuccess: (trip) => {
          setDestination("");
          setStartDate("");
          setDays("3");
          onCreated(trip);
        },
      },
    );
  }

  return (
    <form className="space-y-3" onSubmit={submit}>
      <p className="kami-label text-ink-muted">Plan a new trip</p>
      <TextInput
        id="new-trip-destination"
        label="Destination"
        value={destination}
        onChange={setDestination}
        maxLength={120}
        placeholder="Lisbon, Portugal"
        autoComplete="off"
      />
      <div className="grid grid-cols-[minmax(0,1fr)_5rem] gap-2">
        <TextInput
          id="new-trip-start"
          label="Starts (optional)"
          type="date"
          value={startDate}
          onChange={setStartDate}
        />
        <TextInput
          id="new-trip-days"
          label="Days"
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_TRIP_DAYS}
          value={days}
          onChange={setDays}
        />
      </div>
      <PrimaryButton
        type="submit"
        disabled={create.isPending || !destination.trim()}
        className="w-full"
      >
        {create.isPending ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Plus className="size-4" aria-hidden="true" />
        )}
        Create trip
      </PrimaryButton>
    </form>
  );
}
