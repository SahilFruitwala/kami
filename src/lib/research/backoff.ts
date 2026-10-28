/**
 * How long to wait before retrying a rate-limited Firecrawl call. Pure;
 * tested in tests/research-backoff.test.mjs.
 *
 * Waits follow Firecrawl's `Retry-After` when it gives one, otherwise the
 * schedule below, each capped so a whole unit of work stays inside its time
 * budget. After the last wait the call fails for real and the run stops with
 * Firecrawl's message.
 */

/** Waits before the 2nd, 3rd and 4th tries when Firecrawl gives no hint _(start values)_. */
export const RATE_LIMIT_WAITS_MS = [5_000, 15_000, 25_000] as const;
/** No single wait is longer than this, whatever `Retry-After` says. */
export const MAX_RATE_LIMIT_WAIT_MS = 30_000;

/** The wait before retry number `retry` (0-based), or null when it's time to give up. */
export function rateLimitWait(retry: number, retryAfterMs?: number): number | null {
  if (retry >= RATE_LIMIT_WAITS_MS.length) return null;
  const wait = retryAfterMs ?? RATE_LIMIT_WAITS_MS[retry];
  return Math.min(MAX_RATE_LIMIT_WAIT_MS, Math.max(1_000, wait));
}
