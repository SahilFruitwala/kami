import { useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, MapPin, PencilLine, Plus, Trash2 } from "lucide-react";
import type { Trip, TripItem } from "@/lib/api/trips";
import { dayDate, formatDay, groupByDay } from "@/lib/trip-days.ts";
import { dayColor } from "@/lib/trip-colors.ts";
import { dayWarnings, formatDuration, itemTiming } from "@/lib/trip-route.ts";
import { cn } from "@/lib/utils.ts";
import { IconButton } from "./trip-fields.tsx";
import { ToggleButton, SourceLink } from "./trip-board-controls.tsx";
import { type Actions, SLOT_LABEL } from "./trip-board-utils.ts";
import { ItemForm } from "./trip-item-form.tsx";

export function Itinerary({ trip, actions }: { trip: Trip; actions: Actions }) {
  const days = groupByDay(trip.items, trip.dayCount);
  const [open, setOpen] = useState(true);
  const bodyId = `trip-${trip.id}-itinerary`;

  return (
    <section aria-label="Itinerary" className="space-y-4">
      <ToggleButton
        open={open}
        onToggle={() => setOpen((v) => !v)}
        controls={bodyId}
        className="px-1"
      >
        <span className="kami-label text-ink-muted">
          Itinerary, {trip.dayCount} {trip.dayCount === 1 ? "day" : "days"}
        </span>
      </ToggleButton>
      <div id={bodyId} hidden={!open} className="space-y-4">
        <ol className="space-y-4">
          {days.map((items, index) => (
            <Day key={index} trip={trip} index={index} items={items} actions={actions} />
          ))}
        </ol>
      </div>
    </section>
  );
}

export function Day({
  trip,
  index,
  items,
  actions,
}: {
  trip: Trip;
  index: number;
  items: TripItem[];
  actions: Actions;
}) {
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState(true);
  const date = dayDate(trip.startDate, index);
  const bodyId = `trip-${trip.id}-day-${index}`;
  const warnings = dayWarnings(items);
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
              <span className="ml-2 text-xs text-ink-muted">{items.length}</span>
            ) : null}
          </span>
        </ToggleButton>
        <div className="flex items-center gap-3">
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
}: {
  trip: Trip;
  item: TripItem;
  actions: Actions;
  canMoveUp: boolean;
  canMoveDown: boolean;
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
      <span className="flex flex-col gap-0.5 pt-0.5 font-sans text-[13px] text-ink-muted">
        <span>{timing.explicit ? item.startTime : SLOT_LABEL[item.slot]}</span>
        {item.durationMin ? <span>{formatDuration(item.durationMin)}</span> : null}
      </span>
      <div className="min-w-0 space-y-0.5">
        <p className="font-sans text-sm font-semibold break-words text-ink">{item.title}</p>
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
