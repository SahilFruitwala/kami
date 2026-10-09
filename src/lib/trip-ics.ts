/**
 * Builds an iCalendar (.ics) file from a trip's itinerary. Pure (no DB /
 * framework imports) so it can be unit-tested (scripts/trip-ics.test.mjs).
 *
 * Events use floating local times (no timezone), so they show at the same
 * wall-clock time wherever the traveller's calendar is. Each slot maps to a
 * start time and duration.
 */
import { dayDate, SLOT_ORDER, type Slot } from "./trip-days.ts";

type IcsTrip = {
  id: string;
  title: string;
  destination: string;
  startDate: string | null;
  items: Array<{
    id: string;
    dayIndex: number;
    slot: Slot;
    title: string;
    place: string | null;
    url: string | null;
    notes: string | null;
  }>;
};

const SLOT_TIME: Record<Slot, { hour: number; minutes: number }> = {
  morning: { hour: 9, minutes: 180 },
  afternoon: { hour: 14, minutes: 180 },
  evening: { hour: 19, minutes: 120 },
  night: { hour: 22, minutes: 120 },
};

/** Escape text per RFC 5545 §3.3.11. */
export function icsEscape(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Fold a content line at 75 octets (RFC 5545 §3.1), continuing with a leading space. */
export function icsFold(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let current = "";
  let size = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    // Continuation lines start with a space, which counts toward their 75.
    if (size + n > (out.length ? 74 : 75)) {
      out.push(current);
      current = "";
      size = 0;
    }
    current += ch;
    size += n;
  }
  out.push(current);
  return out.join("\r\n ");
}

const stamp = (iso: string, hour: number, minute = 0) =>
  `${iso.replaceAll("-", "")}T${String(hour).padStart(2, "0")}${String(minute).padStart(2, "0")}00`;

/** DTSTART / DTEND for one item; the end may roll into the next day (night slot). */
function eventTimes(iso: string, slot: Slot): { start: string; end: string } {
  const { hour, minutes } = SLOT_TIME[slot];
  const endTotal = hour * 60 + minutes;
  const endHour = Math.floor(endTotal / 60);
  if (endHour >= 24) {
    const next = new Date(Date.parse(`${iso}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    return { start: stamp(iso, hour), end: stamp(next, endHour - 24, endTotal % 60) };
  }
  return { start: stamp(iso, hour), end: stamp(iso, endHour, endTotal % 60) };
}

/**
 * The calendar text for a trip, or null when the trip has no start date or no
 * plans (there is nothing to place on a calendar).
 */
export function tripToIcs(trip: IcsTrip, now: Date = new Date()): string | null {
  if (!trip.startDate) return null;
  const events = [...trip.items]
    .sort(
      (a, b) => a.dayIndex - b.dayIndex || SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot),
    )
    .flatMap((item) => {
      const iso = dayDate(trip.startDate, item.dayIndex);
      return iso ? [{ item, iso }] : [];
    });
  if (!events.length) return null;

  const created = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//KAMI//Trips//EN",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${icsEscape(trip.title)}`,
  ];
  for (const { item, iso } of events) {
    const { start, end } = eventTimes(iso, item.slot);
    const description = [item.notes, item.url].filter(Boolean).join("\n");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${item.id}@${trip.id}.kami`,
      `DTSTAMP:${created}`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      `SUMMARY:${icsEscape(item.title)}`,
      `LOCATION:${icsEscape(item.place ?? trip.destination)}`,
    );
    if (description) lines.push(`DESCRIPTION:${icsEscape(description)}`);
    if (item.url) lines.push(`URL:${item.url}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(icsFold).join("\r\n") + "\r\n";
}
