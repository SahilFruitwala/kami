import { useState } from "react";
import { PencilLine, Plus, Star, Trash2 } from "lucide-react";
import type { Trip, TripHotel } from "@/lib/api/trips";
import { cn } from "@/lib/utils.ts";
import { IconButton, TextArea, TextInput } from "./trip-fields.tsx";
import { FormButtons, ToggleButton, SourceLink } from "./trip-board-controls.tsx";
import { type Actions, orNull } from "./trip-board-utils.ts";

export function Hotels({ trip, actions }: { trip: Trip; actions: Actions }) {
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
