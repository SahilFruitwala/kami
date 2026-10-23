import { useState } from "react";
import { toast } from "sonner";
import { LoaderCircle, Map as MapIcon, MapPin } from "lucide-react";
import type { Trip, TripItem } from "@/lib/api/trips";
import { dayColor } from "@/lib/trip-colors.ts";
import { hasCoords } from "@/lib/trip-route.ts";
import { cn } from "@/lib/utils.ts";
import { TripMap, type MapDay } from "./trip-map.tsx";
import { type Actions } from "./trip-board-utils.ts";

export type MapSelection = "all" | number;

/** One map for the whole trip: every day in its own color, or a single picked day. */
export function TripMapPanel({
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
              title: `${all ? `Day ${index + 1}, ` : ""}${i + 1}. ${item.title}`,
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
