/**
 * Pure trip helpers shared by the server service and the board UI: date math
 * on `YYYY-MM-DD` strings and grouping itinerary items into days.
 *
 * Kept free of DB / framework imports so it can be unit-tested
 * (scripts/trips.test.mjs). Dates are calendar dates, so all math is in UTC
 * to stay clear of local DST shifts.
 */

export const SLOT_ORDER = ["morning", "afternoon", "evening", "night"] as const;
export type Slot = (typeof SLOT_ORDER)[number];

export const MAX_TRIP_DAYS = 30;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parse `YYYY-MM-DD` into a UTC timestamp, or null when it isn't a real date. */
export function parseIsoDate(value: string): number | null {
  const m = ISO_DATE.exec(value);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const ts = Date.UTC(y, mo - 1, d);
  const back = new Date(ts);
  // Rejects 2027-02-30 and friends, which Date.UTC would roll over.
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) {
    return null;
  }
  return ts;
}

function toIso(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

/** The calendar date of day `index` (0-based), or null when the trip has no start date. */
export function dayDate(startDate: string | null, index: number): string | null {
  if (!startDate) return null;
  const start = parseIsoDate(startDate);
  if (start == null) return null;
  return toIso(start + index * 86_400_000);
}

/** Last day of the trip (inclusive), or null without a start date. */
export function endDate(startDate: string | null, dayCount: number): string | null {
  return dayDate(startDate, Math.max(1, dayCount) - 1);
}

/** Inclusive day count between two `YYYY-MM-DD` dates, or null when invalid / reversed. */
export function daysBetween(start: string, end: string): number | null {
  const a = parseIsoDate(start);
  const b = parseIsoDate(end);
  if (a == null || b == null || b < a) return null;
  return Math.round((b - a) / 86_400_000) + 1;
}

/** "Fri, May 14" for a `YYYY-MM-DD` date (UTC so the label never shifts a day). */
export function formatDay(iso: string, locale?: string): string {
  const ts = parseIsoDate(iso);
  if (ts == null) return iso;
  return new Date(ts).toLocaleDateString(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** "May 14 – 17, 2027" style range for a trip header. */
export function formatRange(startDate: string | null, dayCount: number, locale?: string): string {
  const days = `${dayCount} ${dayCount === 1 ? "day" : "days"}`;
  const end = endDate(startDate, dayCount);
  if (!startDate || !end) return days;
  const fmt = (iso: string) =>
    new Date(parseIsoDate(iso)!).toLocaleDateString(locale, {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
  return startDate === end
    ? `${fmt(startDate)} · ${days}`
    : `${fmt(startDate)} – ${fmt(end)} · ${days}`;
}

type Orderable = { dayIndex: number; slot: Slot; sort: number; id: string };

/** Itinerary order: day, then slot (morning → night), then manual sort, then id. */
export function compareItems(a: Orderable, b: Orderable): number {
  return (
    a.dayIndex - b.dayIndex ||
    SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot) ||
    a.sort - b.sort ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

/**
 * Group items into `dayCount` days, each sorted. Items whose day index falls
 * outside the trip (shouldn't happen — the service guards it) are dropped.
 */
export function groupByDay<T extends Orderable>(items: T[], dayCount: number): T[][] {
  const days: T[][] = Array.from({ length: Math.max(0, dayCount) }, () => []);
  for (const item of [...items].sort(compareItems)) {
    if (item.dayIndex >= 0 && item.dayIndex < days.length) days[item.dayIndex].push(item);
  }
  return days;
}

/** Highest day index that has at least one item, or -1. */
export function lastUsedDay(items: Array<{ dayIndex: number }>): number {
  return items.reduce((max, item) => Math.max(max, item.dayIndex), -1);
}

/**
 * New order of `ids` after moving `id` one step up or down. Returns null when
 * the id isn't in the list or is already at that end.
 */
export function moveWithin(ids: string[], id: string, direction: "up" | "down"): string[] | null {
  const from = ids.indexOf(id);
  const to = direction === "up" ? from - 1 : from + 1;
  if (from < 0 || to < 0 || to >= ids.length) return null;
  const next = [...ids];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}
