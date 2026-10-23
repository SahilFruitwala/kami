import { useState } from "react";
import type { Trip, TripItem, TripSlot } from "@/lib/api/trips";
import { dayDate, formatDay } from "@/lib/trip-days.ts";
import { parseTime, slotForTime } from "@/lib/trip-route.ts";
import { SelectInput, TextArea, TextInput } from "./trip-fields.tsx";
import { FormButtons } from "./trip-board-controls.tsx";
import { type Actions, orNull, SLOT_OPTIONS, DURATION_OPTIONS } from "./trip-board-utils.ts";

export function ItemForm({
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
    return { value: i, label: date ? `Day ${i + 1}, ${formatDay(date)}` : `Day ${i + 1}` };
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
