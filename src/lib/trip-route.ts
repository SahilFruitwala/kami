/**
 * Timing helpers for an itinerary day: slot default times, and warnings for
 * days that don't fit. Pure (no DB / framework imports) so it can be
 * unit-tested (tests/trip-route.test.mjs).
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

/** Planned time (activities) beyond this makes a day "packed". */
export const BUSY_DAY_MINUTES = 12 * 60;

type DayItem = {
  id: string;
  slot: Slot;
  title: string;
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

export type DayWarning = { kind: "busy" | "overlap"; message: string };

/**
 * Warnings for one day: overlapping start times, and more planned activity
 * than fits a day. Only explicit durations and times count toward "busy" and
 * "overlap", so a day of bare slots never warns.
 */
export function dayWarnings(items: DayItem[]): DayWarning[] {
  const warnings: DayWarning[] = [];

  const planned = items.reduce((sum, i) => sum + (i.durationMin ?? 0), 0);
  if (planned > BUSY_DAY_MINUTES) {
    warnings.push({
      kind: "busy",
      message: `Packed day: about ${formatDuration(planned)} of plans.`,
    });
  }

  let last: { end: number; title: string } | null = null;
  for (const item of items) {
    const t = itemTiming(item);
    if (!t.explicit) continue;
    if (last && t.start < last.end) {
      warnings.push({
        kind: "overlap",
        message: `“${item.title}” starts before “${last.title}” ends.`,
      });
    }
    last = {
      end: t.start + (item.durationMin ?? SLOT_DEFAULTS[item.slot].minutes),
      title: item.title,
    };
  }

  return warnings;
}

/** The slot a start time falls in (used to keep slot and time consistent). */
export function slotForTime(minutes: number): Slot {
  if (minutes < 12 * 60) return "morning";
  if (minutes < 17 * 60) return "afternoon";
  if (minutes < 21 * 60 + 30) return "evening";
  return "night";
}
