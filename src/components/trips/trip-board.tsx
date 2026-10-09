import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CalendarDays,
  CalendarPlus,
  Check,
  ChevronDown,
  ExternalLink,
  Footprints,
  LoaderCircle,
  Map as MapIcon,
  MapPin,
  PencilLine,
  Plus,
  Star,
  TramFront,
  Trash2,
  Users,
  Wallet,
} from "lucide-react";
import { useTrip, useTripActions } from "@/hooks/use-trips.ts";
import type { Trip, TripHotel, TripItem, TripSlot } from "@/lib/api/trips";
import {
  dayDate,
  formatDay,
  formatRange,
  groupByDay,
  MAX_TRIP_DAYS,
  SLOT_ORDER,
} from "@/lib/trip-days.ts";
import { dayColor } from "@/lib/trip-colors.ts";
import { tripToIcs } from "@/lib/trip-ics.ts";
import {
  dayHops,
  dayWarnings,
  formatDuration,
  hasCoords,
  itemTiming,
  parseTime,
  slotForTime,
  type Hop,
} from "@/lib/trip-route.ts";
import { cn } from "@/lib/utils.ts";
import {
  IconButton,
  PrimaryButton,
  QuietButton,
  SelectInput,
  TextArea,
  TextInput,
} from "./trip-fields.tsx";
import { TripMap, type MapDay } from "./trip-map.tsx";

type Actions = ReturnType<typeof useTripActions>;

const SLOT_LABEL: Record<TripSlot, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
  night: "Night",
};
/** "" → null so cleared fields clear on the server. */
const orNull = (value: string) => value.trim() || null;

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

const SLOT_OPTIONS = SLOT_ORDER.map((s) => ({ value: s, label: SLOT_LABEL[s] }));

export function TripBoard({ tripId, onDeleted }: { tripId: string; onDeleted: () => void }) {
  const query = useTrip(tripId);
  const actions = useTripActions(tripId);

  if (query.isPending) {
    return <div className="kami-sheet h-60 animate-pulse opacity-60" aria-hidden="true" />;
  }
  if (query.isError) {
    return (
      <p className="kami-sheet p-6 font-body text-sm text-ink-soft">
        {query.error instanceof Error ? query.error.message : "Could not load this trip."}
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

// ---------- Details ----------

function TripDetails({
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
    <section aria-label="Trip details" className="kami-sheet space-y-3 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-2xl leading-tight tracking-tight text-ink">
            {trip.title}
          </h3>
          <p className="mt-1 flex items-center gap-1.5 font-sans text-xs text-ink-soft">
            <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
            {trip.destination}
          </p>
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
            onClick={() => {
              if (window.confirm(`Delete “${trip.title}” with its hotels and plans?`)) {
                actions.remove.mutate(undefined, { onSuccess: onDeleted });
              }
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
            : `${trip.dayCount} days · dates not set`}
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

function FormButtons({
  busy,
  onCancel,
  label,
}: {
  busy: boolean;
  onCancel: () => void;
  label: string;
}) {
  return (
    <div className="flex gap-2">
      <PrimaryButton type="submit" disabled={busy} className="flex-1">
        {busy ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Check className="size-4" aria-hidden="true" />
        )}
        {label}
      </PrimaryButton>
      <QuietButton type="button" onClick={onCancel}>
        Cancel
      </QuietButton>
    </div>
  );
}

/** Chevron button that shows or hides a section's body. */
function ToggleButton({
  open,
  onToggle,
  controls,
  className,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  controls: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={controls}
      className={cn("flex min-w-0 items-center gap-1.5 text-left", className)}
    >
      <ChevronDown
        className={cn("size-4 shrink-0 text-ink-muted transition-transform", !open && "-rotate-90")}
        aria-hidden="true"
      />
      {children}
    </button>
  );
}

// ---------- Hotels ----------

function Hotels({ trip, actions }: { trip: Trip; actions: Actions }) {
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState(true);
  const bodyId = `trip-${trip.id}-hotels`;

  return (
    <section aria-label="Hotels" className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <ToggleButton open={open} onToggle={() => setOpen((v) => !v)} controls={bodyId}>
          <span className="kami-label text-ink-muted">
            Hotels{trip.hotels.length ? ` · ${trip.hotels.length}` : ""}
          </span>
        </ToggleButton>
        {!adding ? (
          <button
            type="button"
            onClick={() => {
              setOpen(true);
              setAdding(true);
            }}
            className="flex items-center gap-1 font-sans text-xs text-ink-soft hover:text-hanko"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            Add hotel
          </button>
        ) : null}
      </div>
      <div id={bodyId} hidden={!open} className="space-y-3">
        {adding ? (
          <HotelForm tripId={trip.id} actions={actions} onDone={() => setAdding(false)} />
        ) : null}
        {trip.hotels.length === 0 && !adding ? (
          <p className="px-1 font-body text-sm text-ink-muted">
            Shortlist a few places to stay, then mark the one you book.
          </p>
        ) : (
          <ul className="space-y-2">
            {trip.hotels.map((h) => (
              <HotelCard key={h.id} hotel={h} tripId={trip.id} actions={actions} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function HotelCard({
  hotel,
  tripId,
  actions,
}: {
  hotel: TripHotel;
  tripId: string;
  actions: Actions;
}) {
  const [editing, setEditing] = useState(false);
  const chosen = hotel.status === "chosen";
  const busy =
    (actions.updateHotel.isPending && actions.updateHotel.variables?.hotelId === hotel.id) ||
    (actions.removeHotel.isPending && actions.removeHotel.variables === hotel.id);

  if (editing) {
    return (
      <li className="list-none">
        <HotelForm
          tripId={tripId}
          hotel={hotel}
          actions={actions}
          onDone={() => setEditing(false)}
        />
      </li>
    );
  }

  return (
    <li
      className={cn(
        "kami-sheet list-none space-y-1.5 p-4",
        chosen && "bg-bamboo-wash ring-1 ring-ok/40",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-sans text-sm font-semibold text-ink">
            <span className="min-w-0 break-words">{hotel.name}</span>
            {chosen ? (
              <span className="rounded-full bg-ok px-1.5 font-sans text-[10px] font-semibold text-white">
                Chosen
              </span>
            ) : null}
          </p>
          {hotel.area ? <p className="font-sans text-xs text-ink-soft">{hotel.area}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <IconButton
            title={chosen ? "Unmark as chosen" : "Mark as chosen"}
            disabled={busy}
            onClick={() =>
              actions.updateHotel.mutate({
                hotelId: hotel.id,
                patch: { status: chosen ? "shortlisted" : "chosen" },
              })
            }
            className={chosen ? "text-ok" : undefined}
          >
            <Star className={cn("size-3.5", chosen && "fill-current")} aria-hidden="true" />
          </IconButton>
          <IconButton title="Edit hotel" disabled={busy} onClick={() => setEditing(true)}>
            <PencilLine className="size-3.5" aria-hidden="true" />
          </IconButton>
          <IconButton
            title="Remove hotel"
            disabled={busy}
            onClick={() => actions.removeHotel.mutate(hotel.id)}
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
          </IconButton>
        </div>
      </div>
      {hotel.priceNote || hotel.ratingNote ? (
        <p className="font-sans text-xs text-ink tabular-nums">
          {[hotel.priceNote, hotel.ratingNote].filter(Boolean).join(" · ")}
        </p>
      ) : null}
      {hotel.why ? (
        <p className="font-body text-sm leading-relaxed text-ink-soft">{hotel.why}</p>
      ) : null}
      {hotel.url ? <SourceLink url={hotel.url} /> : null}
    </li>
  );
}

function HotelForm({
  tripId,
  hotel,
  actions,
  onDone,
}: {
  tripId: string;
  hotel?: TripHotel;
  actions: Actions;
  onDone: () => void;
}) {
  const [name, setName] = useState(hotel?.name ?? "");
  const [area, setArea] = useState(hotel?.area ?? "");
  const [url, setUrl] = useState(hotel?.url ?? "");
  const [priceNote, setPriceNote] = useState(hotel?.priceNote ?? "");
  const [ratingNote, setRatingNote] = useState(hotel?.ratingNote ?? "");
  const [why, setWhy] = useState(hotel?.why ?? "");
  const busy = hotel ? actions.updateHotel.isPending : actions.addHotel.isPending;
  const p = hotel ? `hotel-${hotel.id}` : `new-hotel-${tripId}`;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !name.trim()) return;
    const fields = {
      name: name.trim(),
      area: orNull(area),
      url: orNull(url),
      priceNote: orNull(priceNote),
      ratingNote: orNull(ratingNote),
      why: orNull(why),
    };
    if (hotel) {
      actions.updateHotel.mutate({ hotelId: hotel.id, patch: fields }, { onSuccess: onDone });
    } else {
      actions.addHotel.mutate(fields, { onSuccess: onDone });
    }
  }

  return (
    <form
      aria-label={hotel ? `Edit ${hotel.name}` : "Add a hotel"}
      className="kami-sheet space-y-3 p-4"
      onSubmit={submit}
    >
      <TextInput
        id={`${p}-name`}
        label="Name"
        value={name}
        onChange={setName}
        maxLength={200}
        autoComplete="off"
      />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <TextInput
          id={`${p}-area`}
          label="Area"
          value={area}
          onChange={setArea}
          maxLength={120}
          placeholder="Chiado"
        />
        <TextInput
          id={`${p}-price`}
          label="Price"
          value={priceNote}
          onChange={setPriceNote}
          maxLength={200}
          placeholder="≈ €150/night"
        />
      </div>
      <TextInput
        id={`${p}-rating`}
        label="Rating"
        value={ratingNote}
        onChange={setRatingNote}
        maxLength={200}
        placeholder="9.1 · 800 reviews"
      />
      <TextInput
        id={`${p}-url`}
        label="Link"
        type="url"
        inputMode="url"
        spellCheck={false}
        value={url}
        onChange={setUrl}
        maxLength={2000}
        placeholder="https://"
      />
      <TextArea
        id={`${p}-why`}
        label="Notes"
        value={why}
        onChange={setWhy}
        rows={2}
        maxLength={1000}
      />
      <FormButtons busy={busy} onCancel={onDone} label={hotel ? "Save hotel" : "Add hotel"} />
    </form>
  );
}

// ---------- Itinerary ----------

type MapSelection = "all" | number;

function Itinerary({ trip, actions }: { trip: Trip; actions: Actions }) {
  const days = groupByDay(trip.items, trip.dayCount);
  const [open, setOpen] = useState(true);
  const [mapDay, setMapDay] = useState<MapSelection>("all");
  const mapRef = useRef<HTMLElement>(null);
  const bodyId = `trip-${trip.id}-itinerary`;

  function showDayOnMap(index: number) {
    setMapDay(index);
    mapRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  return (
    <section aria-label="Itinerary" className="space-y-4">
      <ToggleButton
        open={open}
        onToggle={() => setOpen((v) => !v)}
        controls={bodyId}
        className="px-1"
      >
        <span className="kami-label text-ink-muted">
          Itinerary · {trip.dayCount} {trip.dayCount === 1 ? "day" : "days"}
        </span>
      </ToggleButton>
      <div id={bodyId} hidden={!open} className="space-y-4">
        <TripMapPanel
          ref={mapRef}
          trip={trip}
          days={days}
          actions={actions}
          selected={mapDay}
          onSelect={setMapDay}
        />
        <ol className="space-y-4">
          {days.map((items, index) => (
            <Day
              key={index}
              trip={trip}
              index={index}
              items={items}
              actions={actions}
              onShowOnMap={() => showDayOnMap(index)}
            />
          ))}
        </ol>
      </div>
    </section>
  );
}

/** One map for the whole trip: every day in its own color, or a single picked day. */
function TripMapPanel({
  ref,
  trip,
  days,
  actions,
  selected,
  onSelect,
}: {
  ref: React.Ref<HTMLElement>;
  trip: Trip;
  days: TripItem[][];
  actions: Actions;
  selected: MapSelection;
  onSelect: (value: MapSelection) => void;
}) {
  // Places the geocoder couldn't find this visit; skipped so the rest get a turn.
  const [missed, setMissed] = useState<string[]>([]);
  const unpinned = [
    ...trip.hotels.filter((h) => !hasCoords(h)),
    ...trip.items.filter((i) => i.place && !hasCoords(i)),
  ].filter((p) => !missed.includes(p.id)).length;

  function locate() {
    actions.locate.mutate(missed, {
      onSuccess: (res) => {
        setMissed([...missed, ...res.missedIds]);
        const parts = [
          res.found ? `Pinned ${res.found} ${res.found === 1 ? "place" : "places"}` : null,
          res.missedIds.length ? `couldn't find ${res.missedIds.length}` : null,
          res.remaining ? `${res.remaining} still to go` : null,
        ].filter(Boolean);
        if (parts.length) toast.info(`${parts.join(", ")}.`);
      },
    });
  }

  const all = selected === "all";
  // Stop numbers match the itinerary list; "all days" labels pins by day instead.
  const mapDays: MapDay[] = days.flatMap((items, index) => {
    if (!all && index !== selected) return [];
    const stops = items.flatMap((item, i) =>
      hasCoords(item)
        ? [
            {
              lat: item.lat,
              lng: item.lng,
              label: all ? String(index + 1) : String(i + 1),
              title: `${all ? `Day ${index + 1} · ` : ""}${i + 1}. ${item.title}`,
            },
          ]
        : [],
    );
    return stops.length ? [{ key: String(index), color: dayColor(index), stops }] : [];
  });
  const pinnedByDay = days.map((items) => items.filter(hasCoords).length);
  const anyPinned = pinnedByDay.some(Boolean);
  const chosen = trip.hotels.find((h) => h.status === "chosen");
  const hotel =
    chosen && hasCoords(chosen) ? { lat: chosen.lat, lng: chosen.lng, title: chosen.name } : null;

  const chip = (active: boolean) =>
    cn(
      "flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2 font-sans text-xs transition-colors disabled:opacity-40",
      active
        ? "border-ink/30 bg-paper-warm text-ink"
        : "border-line text-ink-soft hover:border-ink/20 hover:text-ink",
    );

  return (
    <section ref={ref} aria-label="Trip map" className="kami-sheet scroll-mt-4 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-paper px-4 py-2">
        <p className="flex items-center gap-1.5 font-sans text-sm font-semibold text-ink">
          <MapIcon className="size-4 text-hanko" aria-hidden="true" />
          Trip map
        </p>
        {unpinned ? (
          <button
            type="button"
            onClick={locate}
            disabled={actions.locate.isPending}
            title="Look up places so they show on the map"
            className="flex items-center gap-1 font-sans text-xs text-ink-soft hover:text-hanko disabled:opacity-50"
          >
            {actions.locate.isPending ? (
              <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <MapPin className="size-3.5" aria-hidden="true" />
            )}
            Pin {unpinned} {unpinned === 1 ? "place" : "places"}
          </button>
        ) : null}
      </div>

      {anyPinned ? (
        <>
          {/* Day picker; each chip's swatch doubles as the map legend. */}
          <div
            role="group"
            aria-label="Show on map"
            className="no-scrollbar flex gap-1.5 overflow-x-auto px-4 py-2"
          >
            <button
              type="button"
              aria-pressed={all}
              onClick={() => onSelect("all")}
              className={chip(all)}
            >
              All days
            </button>
            {pinnedByDay.map((count, index) => (
              <button
                key={index}
                type="button"
                aria-pressed={selected === index}
                disabled={!count}
                onClick={() => onSelect(index)}
                title={count ? `${count} pinned` : "Nothing pinned on this day"}
                className={chip(selected === index)}
              >
                <span
                  aria-hidden="true"
                  className="size-2.5 rounded-full"
                  style={{ background: dayColor(index).fill }}
                />
                Day {index + 1}
              </button>
            ))}
          </div>
          {mapDays.length ? (
            <TripMap
              days={mapDays}
              hotel={hotel}
              label={all ? "Map of every day of the trip" : `Map of day ${Number(selected) + 1}`}
            />
          ) : (
            <p className="px-4 pb-4 font-body text-sm text-ink-muted">
              Nothing on this day is pinned yet.
            </p>
          )}
        </>
      ) : (
        <p className="px-4 py-3 font-body text-sm text-ink-muted">
          {unpinned
            ? "Pin your plans' places to see the trip on a map, day by day."
            : "Add a place to your plans to see them on a map."}
        </p>
      )}
    </section>
  );
}

function Day({
  trip,
  index,
  items,
  actions,
  onShowOnMap,
}: {
  trip: Trip;
  index: number;
  items: TripItem[];
  actions: Actions;
  onShowOnMap: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState(true);
  const date = dayDate(trip.startDate, index);
  const bodyId = `trip-${trip.id}-day-${index}`;
  const hops = dayHops(items);
  const warnings = dayWarnings(items);
  const pinned = items.some(hasCoords);
  const color = dayColor(index);

  return (
    <li className="kami-sheet list-none overflow-hidden">
      <div
        className={cn(
          "flex items-center justify-between gap-2 bg-paper px-4 py-2",
          open && "border-b border-line",
        )}
      >
        <ToggleButton open={open} onToggle={() => setOpen((v) => !v)} controls={bodyId}>
          <span className="font-sans text-sm">
            <span
              aria-hidden="true"
              className="mr-2 inline-block size-2.5 rounded-full align-middle"
              style={{ background: color.fill }}
            />
            <span className="font-semibold text-ink">Day {index + 1}</span>
            {date ? <span className="ml-2 text-ink-muted">{formatDay(date)}</span> : null}
            {!open && items.length ? (
              <span className="ml-2 text-xs text-ink-muted">· {items.length}</span>
            ) : null}
          </span>
        </ToggleButton>
        <div className="flex items-center gap-3">
          {pinned ? (
            <button
              type="button"
              onClick={onShowOnMap}
              className="flex items-center gap-1 font-sans text-xs text-ink-soft hover:text-hanko"
            >
              <MapIcon className="size-3.5" aria-hidden="true" />
              Show on map
            </button>
          ) : null}
          {!adding ? (
            <button
              type="button"
              onClick={() => {
                setOpen(true);
                setAdding(true);
              }}
              className="flex items-center gap-1 font-sans text-xs text-ink-soft hover:text-hanko"
            >
              <Plus className="size-3.5" aria-hidden="true" />
              Add plan
            </button>
          ) : null}
        </div>
      </div>
      <div id={bodyId} hidden={!open}>
        {warnings.length ? (
          <ul className="space-y-1 border-b border-line bg-shu-tint/60 px-4 py-2">
            {warnings.map((w, i) => (
              <li
                key={i}
                className="flex list-none items-start gap-1.5 font-sans text-xs text-hanko"
              >
                <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
                {w.message}
              </li>
            ))}
          </ul>
        ) : null}
        {items.length === 0 && !adding ? (
          <p className="px-4 py-3 font-body text-sm text-ink-muted">Nothing planned yet.</p>
        ) : (
          <ul className="divide-y divide-dashed divide-line">
            {items.map((item, i) => (
              <ItemRow
                key={item.id}
                trip={trip}
                item={item}
                actions={actions}
                canMoveUp={items[i - 1]?.slot === item.slot}
                canMoveDown={items[i + 1]?.slot === item.slot}
                pin={hasCoords(item) ? { number: i + 1, color } : null}
                hop={hops[i]}
              />
            ))}
          </ul>
        )}
        {adding ? (
          <div className="border-t border-line p-4">
            <ItemForm
              trip={trip}
              dayIndex={index}
              actions={actions}
              onDone={() => setAdding(false)}
            />
          </div>
        ) : null}
      </div>
    </li>
  );
}

function ItemRow({
  trip,
  item,
  actions,
  canMoveUp,
  canMoveDown,
  pin,
  hop,
}: {
  trip: Trip;
  item: TripItem;
  actions: Actions;
  canMoveUp: boolean;
  canMoveDown: boolean;
  /** Number and color shown on the trip map, or null when the plan has no pin. */
  pin: { number: number; color: { fill: string; ink: string } } | null;
  /** Travel from the previous pinned stop. */
  hop: Hop | null;
}) {
  const [editing, setEditing] = useState(false);
  const timing = itemTiming(item);
  const busy =
    actions.moveItem.isPending ||
    (actions.updateItem.isPending && actions.updateItem.variables?.itemId === item.id) ||
    (actions.removeItem.isPending && actions.removeItem.variables === item.id);

  if (editing) {
    return (
      <li className="list-none p-4">
        <ItemForm
          trip={trip}
          dayIndex={item.dayIndex}
          item={item}
          actions={actions}
          onDone={() => setEditing(false)}
        />
      </li>
    );
  }

  return (
    <li className="grid list-none grid-cols-[5.5rem_minmax(0,1fr)_auto] gap-3 px-4 py-3">
      <span className="flex flex-col gap-0.5 pt-0.5 font-sans text-[11px] tracking-wide text-ink-muted">
        <span className="uppercase">
          {timing.explicit ? item.startTime : SLOT_LABEL[item.slot]}
        </span>
        {item.durationMin ? <span>{formatDuration(item.durationMin)}</span> : null}
      </span>
      <div className="min-w-0 space-y-0.5">
        {hop ? <HopHint hop={hop} /> : null}
        <p className="flex items-start gap-1.5 font-sans text-sm font-semibold break-words text-ink">
          {pin ? (
            <span
              className="mt-px inline-flex size-4 shrink-0 items-center justify-center rounded-full text-[9px]"
              style={{ background: pin.color.fill, color: pin.color.ink }}
              title="Pinned on the trip map"
            >
              {pin.number}
            </span>
          ) : null}
          <span className="min-w-0">{item.title}</span>
        </p>
        {item.place ? (
          <p className="flex items-center gap-1 font-sans text-xs text-ink-soft">
            <MapPin className="size-3 shrink-0" aria-hidden="true" />
            <span className="min-w-0 break-words">{item.place}</span>
          </p>
        ) : null}
        {item.notes ? (
          <p className="font-body text-sm leading-relaxed whitespace-pre-line text-ink-soft">
            {item.notes}
          </p>
        ) : null}
        {item.url ? <SourceLink url={item.url} /> : null}
      </div>
      <div className="flex items-start gap-0.5">
        {canMoveUp || canMoveDown ? (
          <>
            <IconButton
              title="Move earlier"
              disabled={busy || !canMoveUp}
              onClick={() => actions.moveItem.mutate({ itemId: item.id, direction: "up" })}
            >
              <ArrowUp className="size-3.5" aria-hidden="true" />
            </IconButton>
            <IconButton
              title="Move later"
              disabled={busy || !canMoveDown}
              onClick={() => actions.moveItem.mutate({ itemId: item.id, direction: "down" })}
            >
              <ArrowDown className="size-3.5" aria-hidden="true" />
            </IconButton>
          </>
        ) : null}
        <IconButton title="Edit plan" disabled={busy} onClick={() => setEditing(true)}>
          <PencilLine className="size-3.5" aria-hidden="true" />
        </IconButton>
        <IconButton
          title="Remove plan"
          disabled={busy}
          onClick={() => actions.removeItem.mutate(item.id)}
        >
          <Trash2 className="size-3.5" aria-hidden="true" />
        </IconButton>
      </div>
    </li>
  );
}

function HopHint({ hop }: { hop: Hop }) {
  const Icon = hop.mode === "walk" ? Footprints : TramFront;
  const km = hop.km < 1 ? `${Math.round(hop.km * 1000)} m` : `${hop.km.toFixed(1)} km`;
  return (
    <p
      className="flex items-center gap-1 font-sans text-[11px] text-ink-muted"
      title="Straight-line distance from the previous pinned stop, with a rough travel time"
    >
      <Icon className="size-3 shrink-0" aria-hidden="true" />
      {km} · ~{formatDuration(hop.minutes)} {hop.mode === "walk" ? "walk" : "by transit or car"}
    </p>
  );
}

const DURATION_OPTIONS = [
  { value: "", label: "—" },
  ...[15, 30, 45, 60, 90, 120, 150, 180, 240, 300, 360, 480].map((m) => ({
    value: String(m),
    label: formatDuration(m),
  })),
];

function ItemForm({
  trip,
  dayIndex,
  item,
  actions,
  onDone,
}: {
  trip: Trip;
  dayIndex: number;
  item?: TripItem;
  actions: Actions;
  onDone: () => void;
}) {
  const [day, setDay] = useState(dayIndex);
  const [slot, setSlot] = useState<TripSlot>(item?.slot ?? "morning");
  const [title, setTitle] = useState(item?.title ?? "");
  const [place, setPlace] = useState(item?.place ?? "");
  const [url, setUrl] = useState(item?.url ?? "");
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [startTime, setStartTime] = useState(item?.startTime ?? "");
  const [duration, setDuration] = useState(item?.durationMin ? String(item.durationMin) : "");
  const busy = item ? actions.updateItem.isPending : actions.addItem.isPending;

  function pickTime(value: string) {
    setStartTime(value);
    // A time decides the slot, so the plan lands where it happens.
    const minutes = parseTime(value);
    if (minutes !== null) setSlot(slotForTime(minutes));
  }
  const p = item ? `item-${item.id}` : `new-item-${trip.id}-${dayIndex}`;

  const dayOptions = Array.from({ length: trip.dayCount }, (_, i) => {
    const date = dayDate(trip.startDate, i);
    return { value: i, label: date ? `Day ${i + 1} · ${formatDay(date)}` : `Day ${i + 1}` };
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !title.trim()) return;
    const fields = {
      dayIndex: day,
      slot,
      title: title.trim(),
      place: orNull(place),
      url: orNull(url),
      notes: orNull(notes),
      startTime: orNull(startTime),
      durationMin: duration ? Number(duration) : null,
    };
    if (item) {
      actions.updateItem.mutate({ itemId: item.id, patch: fields }, { onSuccess: onDone });
    } else {
      actions.addItem.mutate(fields, { onSuccess: onDone });
    }
  }

  return (
    <form
      aria-label={item ? `Edit ${item.title}` : "Add a plan"}
      className="space-y-3"
      onSubmit={submit}
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {item ? (
          <SelectInput
            id={`${p}-day`}
            label="Day"
            value={day}
            options={dayOptions}
            onChange={setDay}
          />
        ) : null}
        <SelectInput
          id={`${p}-slot`}
          label="When"
          value={slot}
          options={SLOT_OPTIONS}
          onChange={setSlot}
        />
        <TextInput
          id={`${p}-start`}
          label="Start time (optional)"
          type="time"
          value={startTime}
          onChange={pickTime}
        />
        <SelectInput
          id={`${p}-duration`}
          label="Takes"
          value={duration}
          options={DURATION_OPTIONS}
          onChange={setDuration}
        />
      </div>
      <TextInput
        id={`${p}-title`}
        label="Plan"
        value={title}
        onChange={setTitle}
        maxLength={200}
        placeholder="National Tile Museum"
        autoComplete="off"
      />
      <TextInput
        id={`${p}-place`}
        label="Place"
        value={place}
        onChange={setPlace}
        maxLength={200}
      />
      <TextInput
        id={`${p}-url`}
        label="Link"
        type="url"
        inputMode="url"
        spellCheck={false}
        value={url}
        onChange={setUrl}
        maxLength={2000}
        placeholder="https://"
      />
      <TextArea
        id={`${p}-notes`}
        label="Notes"
        value={notes}
        onChange={setNotes}
        rows={2}
        maxLength={2000}
      />
      <FormButtons busy={busy} onCancel={onDone} label={item ? "Save plan" : "Add plan"} />
    </form>
  );
}

// ---------- Shared ----------

function SourceLink({ url }: { url: string }) {
  let host = url;
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    // Stored URLs are validated server-side; fall back to the raw text.
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex max-w-full items-center gap-1 font-sans text-xs text-ink-muted hover:text-hanko"
    >
      <span className="truncate">{host}</span>
      <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
    </a>
  );
}
