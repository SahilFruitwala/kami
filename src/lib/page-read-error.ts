/**
 * A failed read from a page source (Firecrawl, Reddit, Hacker News), with a
 * message written for people. `status` 429 means "rate limited, retry";
 * `retryAfterMs` carries the source's own hint when it gave one. Research
 * skips a page that fails this way and carries on, except for failures that
 * will fail every page (see services/research/evidence.ts).
 *
 * Plain fields (no constructor parameter properties) so Node's type
 * stripping can load this file in tests.
 */
export class PageReadError extends Error {
  readonly status: number | undefined;
  readonly retryAfterMs: number | undefined;
  constructor(message: string, status?: number, retryAfterMs?: number) {
    super(message);
    this.name = "PageReadError";
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

/** `Retry-After` as milliseconds: seconds or an HTTP date; undefined when absent or unreadable. */
export function parseRetryAfter(header: string | null, now = Date.now()): number | undefined {
  if (!header?.trim()) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return seconds >= 0 ? seconds * 1000 : undefined;
  const at = Date.parse(header);
  return Number.isNaN(at) ? undefined : Math.max(0, at - now);
}
