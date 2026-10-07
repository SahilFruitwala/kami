/**
 * Feed poll scheduling — pure math, unit-tested.
 *
 * Polls adapt to each feed: a feed that keeps publishing is checked more
 * often (down to MIN), a quiet one drifts out (up to MAX). Publisher hints
 * (RSS <ttl>, Cache-Control max-age, Retry-After) are only ever used to poll
 * *less* often, and errors back off exponentially. Jitter spreads feeds that
 * were added together so they don't all come due in the same minute.
 */

export const FEED_DEFAULT_INTERVAL_MIN = 60;
export const FEED_MIN_INTERVAL_MIN = 30;
export const FEED_MAX_INTERVAL_MIN = 12 * 60;
export const FEED_MAX_BACKOFF_MIN = 24 * 60;
/** Claimed feeds are leased this long so concurrent pollers skip them. */
export const FEED_LEASE_MIN = 10;
/** A manual refresh never re-polls a feed checked more recently than this. */
export const FEED_MANUAL_MIN_AGE_MIN = 5;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Next steady-state interval after a successful poll. */
export function nextInterval(
  prevMinutes: number,
  newEntries: number,
  hintMinutes: number | null,
): number {
  const prev = clamp(
    prevMinutes || FEED_DEFAULT_INTERVAL_MIN,
    FEED_MIN_INTERVAL_MIN,
    FEED_MAX_INTERVAL_MIN,
  );
  const adapted = newEntries > 0 ? prev / 2 : prev * 1.5;
  const floor = hintMinutes ? Math.min(hintMinutes, FEED_MAX_INTERVAL_MIN) : FEED_MIN_INTERVAL_MIN;
  return Math.round(clamp(adapted, Math.max(FEED_MIN_INTERVAL_MIN, floor), FEED_MAX_INTERVAL_MIN));
}

/** Delay after the Nth consecutive failure (1-based): 30m, 1h, 2h … capped at 24h. */
export function errorBackoffMinutes(errorCount: number): number {
  const n = Math.max(1, errorCount);
  return Math.min(FEED_MAX_BACKOFF_MIN, FEED_MIN_INTERVAL_MIN * 2 ** (n - 1));
}

/** ±10% jitter, never below one minute. */
export function withJitter(minutes: number, random: () => number = Math.random): number {
  return Math.max(1, Math.round(minutes * (0.9 + random() * 0.2)));
}

/** `Retry-After` (seconds or HTTP date) → minutes, or null. */
export function retryAfterMinutes(header: string | null, now = Date.now()): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds / 60);
  const at = Date.parse(header);
  return Number.isFinite(at) ? Math.max(0, Math.ceil((at - now) / 60_000)) : null;
}

/** `Cache-Control: max-age` → minutes, or null. */
export function maxAgeMinutes(cacheControl: string | null): number | null {
  const match = /(?:^|,)\s*(?:s-)?max-age\s*=\s*(\d+)/i.exec(cacheControl ?? "");
  if (!match) return null;
  const minutes = Math.ceil(Number(match[1]) / 60);
  return minutes > 0 ? minutes : null;
}
