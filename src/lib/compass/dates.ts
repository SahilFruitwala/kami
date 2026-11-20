/**
 * Calendar maths for Compass on plain `YYYY-MM-DD` strings (no timezones:
 * "today" is resolved once, in the user's zone, and everything else is
 * whole-day arithmetic in UTC). Isomorphic.
 *
 * Weekdays are 0 = Monday … 6 = Sunday everywhere, independent of the
 * user's week-start setting (`weekStart`: 1 = Monday, 0 = Sunday).
 */

export type IsoDay = string;
export type WeekStart = 0 | 1;
export type QuarterKey = { year: number; quarter: 1 | 2 | 3 | 4 };

const DAY_MS = 86_400_000;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDay(value: string): boolean {
  if (!ISO.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

const toMs = (day: IsoDay) => Date.parse(`${day}T00:00:00Z`);
const fromMs = (ms: number): IsoDay => new Date(ms).toISOString().slice(0, 10);

export const addDays = (day: IsoDay, n: number): IsoDay => fromMs(toMs(day) + n * DAY_MS);

/** Whole days from `a` to `b` (negative when `b` is earlier). */
export const daysBetween = (a: IsoDay, b: IsoDay) => Math.round((toMs(b) - toMs(a)) / DAY_MS);

/** 0 = Monday … 6 = Sunday. */
export const weekday = (day: IsoDay) => (new Date(toMs(day)).getUTCDay() + 6) % 7;

/** First day of the week containing `day`. */
export function weekStartOf(day: IsoDay, weekStart: WeekStart): IsoDay {
  const offset = weekStart === 1 ? weekday(day) : new Date(toMs(day)).getUTCDay();
  return addDays(day, -offset);
}

/** The 7 days of the week starting `start`. */
export const weekDays = (start: IsoDay): IsoDay[] =>
  Array.from({ length: 7 }, (_, i) => addDays(start, i));

const calendarQuarter = (day: IsoDay): QuarterKey => ({
  year: Number(day.slice(0, 4)),
  quarter: (Math.floor((Number(day.slice(5, 7)) - 1) / 3) + 1) as QuarterKey["quarter"],
});

/** A week belongs to the quarter its last day falls in. */
export const quarterOfWeek = (start: IsoDay): QuarterKey => calendarQuarter(addDays(start, 6));

/** The quarter "today" is in: the quarter of the week containing it. */
export const quarterOf = (day: IsoDay, weekStart: WeekStart): QuarterKey =>
  quarterOfWeek(weekStartOf(day, weekStart));

export const quarterId = (q: QuarterKey) => `${q.year}-q${q.quarter}`;

export function parseQuarterId(value: string): QuarterKey | null {
  const m = /^(\d{4})-q([1-4])$/.exec(value);
  return m ? { year: Number(m[1]), quarter: Number(m[2]) as QuarterKey["quarter"] } : null;
}

export const sameQuarter = (a: QuarterKey, b: QuarterKey) =>
  a.year === b.year && a.quarter === b.quarter;

export function shiftQuarter(q: QuarterKey, by: number): QuarterKey {
  const i = q.year * 4 + (q.quarter - 1) + by;
  return { year: Math.floor(i / 4), quarter: ((i % 4) + 1) as QuarterKey["quarter"] };
}

/** Week starts of every week that belongs to the quarter (13 or 14 of them). */
export function quarterWeeks(q: QuarterKey, weekStart: WeekStart): IsoDay[] {
  const first = `${q.year}-${String((q.quarter - 1) * 3 + 1).padStart(2, "0")}-01`;
  let start = weekStartOf(first, weekStart);
  if (!sameQuarter(quarterOfWeek(start), q)) start = addDays(start, 7);
  const weeks: IsoDay[] = [];
  while (sameQuarter(quarterOfWeek(start), q)) {
    weeks.push(start);
    start = addDays(start, 7);
  }
  return weeks;
}

/** Fraction of the quarter's days that have started by the end of `today` (0–1). */
export function quarterElapsed(q: QuarterKey, today: IsoDay, weekStart: WeekStart): number {
  const weeks = quarterWeeks(q, weekStart);
  const total = weeks.length * 7;
  const done = daysBetween(weeks[0]!, today) + 1;
  return Math.min(1, Math.max(0, done / total));
}

/** The user's local calendar day for an instant, in an IANA zone (falls back to UTC). */
export function localDay(timeZone: string, at = new Date()): IsoDay {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(at);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    return `${get("year")}-${get("month")}-${get("day")}`;
  } catch {
    return at.toISOString().slice(0, 10);
  }
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Nov 19". */
export const shortDay = (day: IsoDay) =>
  `${MONTHS[Number(day.slice(5, 7)) - 1]} ${Number(day.slice(8, 10))}`;

/** "Oct 1 – Dec 31". */
export function quarterRange(q: QuarterKey): string {
  const startMonth = (q.quarter - 1) * 3;
  const end = new Date(Date.UTC(q.year, startMonth + 3, 0)).getUTCDate();
  return `${MONTHS[startMonth]} 1 – ${MONTHS[startMonth + 2]} ${end}`;
}
