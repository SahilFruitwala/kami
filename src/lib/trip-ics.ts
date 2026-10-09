/**
 * Builds an iCalendar (.ics) file from a trip's itinerary. Pure (no DB /
 * framework imports) so it can be unit-tested (scripts/trip-ics.test.mjs).
 *
 * Events use floating local times (no timezone), so they show at the same
 * wall-clock time wherever the traveller's calendar is. A plan's own start
 * time and duration win; otherwise its slot's defaults are used.
 */
import { dayDate, SLOT_ORDER, type Slot } from "./trip-days.ts";
import { itemTiming } from "./trip-route.ts";

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
    startTime?: string | null;
    durationMin?: number | null;
  }>;
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

const pad = (n: number) => String(n).padStart(2, "0");

/** `YYYYMMDDTHHMMSS` for a day plus minutes after its midnight (may roll into later days). */
function stamp(iso: string, minutes: number): string {
  const day = new Date(Date.parse(`${iso}T00:00:00Z`) + Math.floor(minutes / 1440) * 86_400_000);
  const m = minutes % 1440;
  return `${day.toISOString().slice(0, 10).replaceAll("-", "")}T${pad(Math.floor(m / 60))}${pad(m % 60)}00`;
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
    const timing = itemTiming({
      slot: item.slot,
      startTime: item.startTime ?? null,
      durationMin: item.durationMin ?? null,
    });
    const description = [item.notes, item.url].filter(Boolean).join("\n");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${item.id}@${trip.id}.kami`,
      `DTSTAMP:${created}`,
      `DTSTART:${stamp(iso, timing.start)}`,
      `DTEND:${stamp(iso, timing.start + timing.minutes)}`,
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
