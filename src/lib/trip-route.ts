/**
 * Timing and distance for an itinerary day: slot default times, straight-line
 * hops between located stops, a rough travel estimate, and warnings for days
 * that don't fit. Pure (no DB / framework imports) so it can be unit-tested
 * (scripts/trip-route.test.mjs).
 *
 * Travel estimates are deliberately rough: straight-line distance with a
 * detour factor, walking for short hops, an average urban speed otherwise.
 * They are hints for spotting a bad day, not directions.
 */
import type { Slot } from "./trip-days.ts";

/** When a plan without a start time is assumed to begin, and how long it lasts. */
export const SLOT_DEFAULTS: Record<Slot, { start: number; minutes: number }> = {
  morning: { start: 9 * 60, minutes: 180 },
  afternoon: { start: 14 * 60, minutes: 180 },
  evening: { start: 19 * 60, minutes: 120 },
  night: { start: 22 * 60, minutes: 120 },
};

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** "HH:MM" → minutes after midnight, or null when malformed. */
export function parseTime(value: string): number | null {
  const m = TIME.exec(value);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** "1 h 30 min", "45 min". */
export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
}

export type LatLng = { lat: number; lng: number };

export const hasCoords = <T extends { lat: number | null; lng: number | null }>(
  p: T,
): p is T & LatLng => p.lat != null && p.lng != null;

/** Great-circle distance in kilometres. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Hops up to this far (straight line) are assumed to be walked. */
export const WALK_KM = 1.5;
/** A hop longer than this gets a warning. */
export const LONG_HOP_KM = 15;
/** Planned time (activities + travel) beyond this makes a day "packed". */
export const BUSY_DAY_MINUTES = 12 * 60;

const DETOUR = 1.3;
const WALK_KMH = 4.5;
const RIDE_KMH = 22;
const RIDE_OVERHEAD_MIN = 10;

export type Hop = { km: number; minutes: number; mode: "walk" | "ride" };

/** Rough door-to-door estimate for a straight-line distance. */
export function travelEstimate(km: number): Hop {
  const road = km * DETOUR;
  if (km <= WALK_KM)
    return { km, minutes: Math.max(1, Math.round((road / WALK_KMH) * 60)), mode: "walk" };
  return { km, minutes: Math.round((road / RIDE_KMH) * 60 + RIDE_OVERHEAD_MIN), mode: "ride" };
}

type DayItem = {
  id: string;
  slot: Slot;
  title: string;
  lat: number | null;
  lng: number | null;
  startTime: string | null;
  durationMin: number | null;
};

/** Start and length of a plan, from its own fields or its slot's defaults. */
export function itemTiming(item: Pick<DayItem, "slot" | "startTime" | "durationMin">): {
  start: number;
  minutes: number;
  explicit: boolean;
} {
  const own = item.startTime ? parseTime(item.startTime) : null;
  const slot = SLOT_DEFAULTS[item.slot];
  return {
    start: own ?? slot.start,
    minutes: item.durationMin ?? slot.minutes,
    explicit: own !== null,
  };
}

/**
 * For each item (in itinerary order), the hop from the previous located stop
 * that day, or null for the first located stop and for unlocated items.
 */
export function dayHops(items: DayItem[]): Array<Hop | null> {
  let prev: LatLng | null = null;
  return items.map((item) => {
    if (!hasCoords(item)) return null;
    const hop: Hop | null = prev ? travelEstimate(haversineKm(prev, item)) : null;
    prev = { lat: item.lat, lng: item.lng };
    return hop;
  });
}

export type DayWarning = { kind: "busy" | "long-hop" | "overlap"; message: string };

/**
 * Warnings for one day: overlapping start times, long hops, and more planned
 * activity + travel than fits a day. Only explicit durations and times count
 * toward "busy" and "overlap", so a day of bare slots never warns.
 */
export function dayWarnings(items: DayItem[]): DayWarning[] {
  const warnings: DayWarning[] = [];
  const hops = dayHops(items);

  const travel = hops.reduce((sum, h) => sum + (h?.minutes ?? 0), 0);
  const planned = items.reduce((sum, i) => sum + (i.durationMin ?? 0), 0);
  if (planned + travel > BUSY_DAY_MINUTES) {
    warnings.push({
      kind: "busy",
      message: `Packed day: about ${formatDuration(planned + travel)} of plans and travel.`,
    });
  }

  hops.forEach((hop, i) => {
    if (hop && hop.km > LONG_HOP_KM) {
      warnings.push({
        kind: "long-hop",
        message: `Long trip to “${items[i].title}”: about ${Math.round(hop.km)} km.`,
      });
    }
  });

  // Overlaps between consecutive timed plans, counting the travel between them.
  let last: { end: number; title: string } | null = null;
  items.forEach((item, i) => {
    const t = itemTiming(item);
    if (!t.explicit) return;
    if (last && t.start < last.end + (hops[i]?.minutes ?? 0)) {
      warnings.push({
        kind: "overlap",
        message: `“${item.title}” starts before “${last.title}” ends${hops[i] ? " and you get there" : ""}.`,
      });
    }
    last = {
      end: t.start + (item.durationMin ?? SLOT_DEFAULTS[item.slot].minutes),
      title: item.title,
    };
  });

  return warnings;
}

/** The slot a start time falls in (used to keep slot and time consistent). */
export function slotForTime(minutes: number): Slot {
  if (minutes < 12 * 60) return "morning";
  if (minutes < 17 * 60) return "afternoon";
  if (minutes < 21 * 60 + 30) return "evening";
  return "night";
}
