import { useState } from "react";
import { toast } from "sonner";
import {
  CalendarDays,
  CalendarPlus,
  MapPin,
  PencilLine,
  Trash2,
  Users,
  Wallet,
} from "lucide-react";
import type { Trip } from "@/lib/api/trips";
import { formatRange, MAX_TRIP_DAYS, TRIP_STATUS_LABEL } from "@/lib/trip-days.ts";
import { tripToIcs } from "@/lib/trip-ics.ts";
import { IconButton, TextArea, TextInput } from "./trip-fields.tsx";
import { confirmAction } from "@/lib/confirm.ts";
import { StatusSelect } from "./trip-status.tsx";
import { FormButtons } from "./trip-board-controls.tsx";
import { type Actions, orNull } from "./trip-board-utils.ts";

/** Download the itinerary as an .ics file (null date / no plans → explain instead). */
function downloadCalendar(trip: Trip) {
  const ics = tripToIcs(trip);
  if (!ics) {
    toast.info(
      trip.startDate
        ? "Add some plans first, then export them to your calendar."
        : "Set a start date to export the itinerary to your calendar.",
    );
    return;
  }
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${trip.title.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "trip"}.ics`;
  link.click();
  URL.revokeObjectURL(url);
}

export function TripDetails({
  trip,
  actions,
  onDeleted,
}: {
  trip: Trip;
  actions: Actions;
  onDeleted: () => void;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return <DetailsForm trip={trip} actions={actions} onDone={() => setEditing(false)} />;
  }

  return (
    <section aria-label="Trip details" className="kami-sheet space-y-4 p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-4xl leading-none tracking-tight text-ink sm:text-5xl">
            {trip.title}
          </h1>
          <p className="mt-3 flex items-center gap-1.5 font-display text-lg text-ink-soft italic">
            <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
            {trip.destination}
          </p>
          <div className="mt-3 flex items-center gap-2 font-sans text-xs text-ink-soft">
            <span className="kami-label text-ink-muted">Status</span>
            <StatusSelect
              label={`Trip status, now ${TRIP_STATUS_LABEL[trip.status]}`}
              value={trip.status}
              disabled={actions.update.isPending}
              onChange={(status) => actions.update.mutate({ status })}
            />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <IconButton
            title="Add itinerary to calendar (.ics)"
            onClick={() => downloadCalendar(trip)}
          >
            <CalendarPlus className="size-3.5" aria-hidden="true" />
          </IconButton>
          <IconButton title="Edit trip details" onClick={() => setEditing(true)}>
            <PencilLine className="size-3.5" aria-hidden="true" />
          </IconButton>
          <IconButton
            title="Delete trip"
            disabled={actions.remove.isPending}
            onClick={async () => {
              const ok = await confirmAction({
                title: `Delete “${trip.title}”?`,
                description: "Its hotels and plans are deleted too.",
                confirmLabel: "Delete trip",
              });
              if (ok) actions.remove.mutate(undefined, { onSuccess: onDeleted });
            }}
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
          </IconButton>
        </div>
      </div>
      <dl className="grid grid-cols-1 gap-2 font-sans text-xs sm:grid-cols-2">
        <Detail icon={CalendarDays} label="When">
          {trip.startDate
            ? formatRange(trip.startDate, trip.dayCount)
            : `${trip.dayCount} days, dates not set`}
        </Detail>
        <Detail icon={Users} label="Travellers">
          {trip.travelers ?? "—"}
        </Detail>
        <Detail icon={Wallet} label="Budget">
          {trip.budget ?? "—"}
        </Detail>
      </dl>
      {trip.preferences ? (
        <p className="font-body text-sm leading-relaxed whitespace-pre-line text-ink-soft">
          {trip.preferences}
        </p>
      ) : null}
    </section>
  );
}

function Detail({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof MapPin;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-start gap-1.5">
      <Icon className="mt-px size-3.5 shrink-0 text-ink-muted" aria-hidden="true" />
      <dt className="sr-only">{label}</dt>
      <dd className="min-w-0 text-ink">{children}</dd>
    </div>
  );
}

function DetailsForm({
  trip,
  actions,
  onDone,
}: {
  trip: Trip;
  actions: Actions;
  onDone: () => void;
}) {
  const [title, setTitle] = useState(trip.title);
  const [destination, setDestination] = useState(trip.destination);
  const [startDate, setStartDate] = useState(trip.startDate ?? "");
  const [days, setDays] = useState(String(trip.dayCount));
  const [travelers, setTravelers] = useState(trip.travelers ? String(trip.travelers) : "");
  const [budget, setBudget] = useState(trip.budget ?? "");
  const [preferences, setPreferences] = useState(trip.preferences ?? "");
  const busy = actions.update.isPending;
  const p = `trip-${trip.id}`;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !title.trim() || !destination.trim()) return;
    const people = Number.parseInt(travelers, 10);
    actions.update.mutate(
      {
        title: title.trim(),
        destination: destination.trim(),
        startDate: startDate || null,
        dayCount: Math.min(MAX_TRIP_DAYS, Math.max(1, Number.parseInt(days, 10) || trip.dayCount)),
        travelers: Number.isFinite(people) && people > 0 ? Math.min(20, people) : null,
        budget: orNull(budget),
        preferences: orNull(preferences),
      },
      { onSuccess: onDone },
    );
  }

  return (
    <form aria-label="Edit trip details" className="kami-sheet space-y-3 p-5" onSubmit={submit}>
      <TextInput id={`${p}-title`} label="Name" value={title} onChange={setTitle} maxLength={120} />
      <TextInput
        id={`${p}-destination`}
        label="Destination"
        value={destination}
        onChange={setDestination}
        maxLength={120}
      />
      <div className="grid grid-cols-[minmax(0,1fr)_5rem] gap-2">
        <TextInput
          id={`${p}-start`}
          label="Starts"
          type="date"
          value={startDate}
          onChange={setStartDate}
        />
        <TextInput
          id={`${p}-days`}
          label="Days"
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_TRIP_DAYS}
          value={days}
          onChange={setDays}
        />
      </div>
      <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-2">
        <TextInput
          id={`${p}-travelers`}
          label="People"
          type="number"
          inputMode="numeric"
          min={1}
          max={20}
          value={travelers}
          onChange={setTravelers}
        />
        <TextInput
          id={`${p}-budget`}
          label="Budget"
          value={budget}
          onChange={setBudget}
          maxLength={200}
          placeholder="Around €150 a night"
        />
      </div>
      <TextArea
        id={`${p}-preferences`}
        label="What you like"
        value={preferences}
        onChange={setPreferences}
        maxLength={2000}
        placeholder="Food, tiles, late starts, no long drives…"
      />
      <FormButtons busy={busy} onCancel={onDone} label="Save details" />
    </form>
  );
}
