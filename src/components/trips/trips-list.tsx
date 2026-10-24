import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { BedDouble, CalendarDays, LoaderCircle, MapPin, Plus, X } from "lucide-react";
import { useCreateTrip, useTripListActions, useTripsList } from "@/hooks/use-trips.ts";
import type { Trip, TripSummary } from "@/lib/api/trips";
import { confirmAction } from "@/lib/confirm.ts";
import { errorMessage } from "@/lib/errors";
import { relativeTime } from "@/lib/time.ts";
import { formatRange, MAX_TRIP_DAYS, TRIP_STATUS_LABEL, type TripStatus } from "@/lib/trip-days.ts";
import { cn } from "@/lib/utils.ts";
import { PrimaryButton, QuietButton, TextInput } from "./trip-fields.tsx";
import { StatusSelect } from "./trip-status.tsx";

const TABS = ["planning", "booked", "done"] as const;

const EMPTY: Record<TripStatus, string> = {
  planning: "Nothing in the works. Start a trip with New trip: a destination is enough.",
  booked: "No booked trips. Mark a trip Booked once the big pieces are confirmed.",
  done: "Nothing finished yet. Trips you mark Done land here.",
  archived: "Nothing archived. Archive a trip to tuck it away without deleting it.",
};

export function TripsList({ onCreated }: { onCreated: (trip: Trip) => void }) {
  const list = useTripsList();
  const { setStatus, remove } = useTripListActions();
  const [tab, setTab] = useState<TripStatus>("planning");
  const [adding, setAdding] = useState(false);
  const trips = list.data ?? [];
  const count = (s: TripStatus) => trips.filter((t) => t.status === s).length;
  const shown = trips.filter((t) => t.status === tab);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div
          role="tablist"
          aria-label="Trip status"
          className="g-seg !h-auto grid min-w-0 flex-1 grid-cols-3 gap-0.5 p-1 sm:flex-none"
        >
          {TABS.map((s) => (
            <button
              key={s}
              role="tab"
              type="button"
              aria-selected={tab === s}
              onClick={() => setTab(s)}
              className={cn(
                "h-8 rounded-full px-2 font-sans text-sm font-medium transition-colors sm:px-4",
                tab === s ? "bg-surface text-ink shadow-sm" : "text-ink-soft hover:text-ink",
              )}
            >
              {TRIP_STATUS_LABEL[s]} <span className="text-ink-muted">{count(s)}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-pressed={tab === "archived"}
          onClick={() => setTab("archived")}
          className={cn(
            "font-sans text-sm underline-offset-4 hover:underline",
            tab === "archived" ? "text-ink" : "text-ink-muted",
          )}
        >
          Archived {count("archived")}
        </button>
        <PrimaryButton
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="ml-auto h-9 px-4 text-sm"
        >
          {adding ? (
            <X className="size-4" aria-hidden="true" />
          ) : (
            <Plus className="size-4" aria-hidden="true" />
          )}
          {adding ? "Close" : "New trip"}
        </PrimaryButton>
      </div>

      {adding ? (
        <NewTripForm
          onCreated={(trip) => {
            setAdding(false);
            setTab("planning");
            onCreated(trip);
          }}
        />
      ) : null}

      {list.isPending ? (
        <div className="kami-sheet h-40 animate-pulse opacity-60" aria-hidden="true" />
      ) : list.isError ? (
        <p className="kami-sheet p-6 font-body text-sm text-ink-soft">
          {errorMessage(list.error, "Could not load your trips.")}
        </p>
      ) : shown.length === 0 ? (
        <p className="kami-sheet p-6 font-body text-sm leading-relaxed text-ink-soft">
          {EMPTY[tab]}
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((t) => (
            <li key={t.id} className="list-none">
              <TripCard
                trip={t}
                busy={setStatus.isPending || remove.isPending}
                onStatus={(status) => setStatus.mutate({ id: t.id, status })}
                onDelete={async () => {
                  const ok = await confirmAction({
                    title: `Delete “${t.title}”?`,
                    description: "Its hotels and plans are deleted too.",
                    confirmLabel: "Delete trip",
                  });
                  if (ok) remove.mutate(t.id);
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TripCard({
  trip: t,
  busy,
  onStatus,
  onDelete,
}: {
  trip: TripSummary;
  busy: boolean;
  onStatus: (status: TripStatus) => void;
  onDelete: () => void;
}) {
  return (
    <div className="kami-sheet flex h-full flex-col gap-2 p-4 transition-colors hover:bg-paper-warm">
      <Link
        to="/trips/$id"
        params={{ id: t.id }}
        className="flex flex-col gap-2 focus-visible:ring-2 focus-visible:ring-hanko/40 focus-visible:outline-none"
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
            {t.chosenHotel ?? (t.hotelCount ? `${t.hotelCount} shortlisted` : "No hotel yet")}
          </span>
        </span>
        <span className="font-sans text-[11px] text-ink-muted">
          {t.itemCount} {t.itemCount === 1 ? "plan" : "plans"}, updated {relativeTime(t.updatedAt)}
        </span>
      </Link>
      <div className="mt-auto flex items-center gap-2 pt-1">
        {t.status === "archived" ? (
          <>
            <QuietButton
              type="button"
              disabled={busy}
              onClick={() => onStatus("planning")}
              className="h-8"
            >
              Unarchive
            </QuietButton>
            <button
              type="button"
              disabled={busy}
              onClick={onDelete}
              className="h-8 rounded-full px-3 font-sans text-xs text-hanko transition-colors hover:bg-paper-warm disabled:opacity-50"
            >
              Delete
            </button>
          </>
        ) : (
          <StatusSelect
            label={`Status of ${t.title}`}
            value={t.status}
            disabled={busy}
            onChange={onStatus}
          />
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
      { onSuccess: onCreated },
    );
  }

  return (
    <form
      className="kami-sheet grid grid-cols-1 items-end gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_10rem_5rem_auto]"
      onSubmit={submit}
    >
      <TextInput
        id="new-trip-destination"
        label="Destination"
        value={destination}
        onChange={setDestination}
        maxLength={120}
        placeholder="Lisbon, Portugal"
        autoComplete="off"
        autoFocus
      />
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
      <PrimaryButton
        type="submit"
        disabled={create.isPending || !destination.trim()}
        className="px-5"
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
