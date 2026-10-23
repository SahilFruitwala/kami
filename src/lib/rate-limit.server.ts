import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db.server";

/**
 * Fixed-window, per-user rate limits backed by the `rate_limits` table
 * (migration 0003). Guards the endpoints that make outbound requests on the
 * user's behalf — article extraction, TMDB / Open Library / link-preview
 * lookups and the image proxy — so one account can't turn the server into an
 * open fetcher or burn third-party API quotas.
 *
 * One row per (bucket, user): the row is reset when a new window starts, so
 * the table stays bounded by users × buckets.
 */

export const RATE_LIMITS = {
  /** Page extraction (single save, manual import, bulk save — cost per URL). */
  extract: { limit: 120, windowSeconds: 600 },
  /** Metadata lookups: TMDB search/providers/seasons, Open Library, link preview. */
  lookup: { limit: 240, windowSeconds: 60 },
  /** Authenticated image proxy (a shelf grid loads many covers at once). */
  image: { limit: 600, windowSeconds: 60 },
  /** Feed adds (discovery fetches) and manual refreshes. */
  feeds: { limit: 60, windowSeconds: 600 },
  /** Firecrawl extract runs (each one spends paid Firecrawl credits). */
  firecrawl: { limit: 30, windowSeconds: 3600 },
  /** Library AI calls: summaries, tags, suggestions (one model call each). */
  ai: { limit: 300, windowSeconds: 3600 },
  /** Create audio (each start can spend Deepgram credit on a whole article). */
  narration: { limit: 30, windowSeconds: 3600 },
  /** Inbound newsletter emails stored per user. */
  inbound: { limit: 300, windowSeconds: 86_400 },
} as const;

export type RateLimitBucket = keyof typeof RATE_LIMITS;

/**
 * Buckets that spend paid third-party credits (Firecrawl, model tokens). If
 * the limiter itself is down these fail *closed*: a database blip must not
 * become an unmetered window on someone else's bill. Everything else fails
 * open so normal reading/saving keeps working.
 */
const FAIL_CLOSED: ReadonlySet<RateLimitBucket> = new Set(["firecrawl", "ai", "narration"]);

export class RateLimitError extends Error {
  readonly status = 429;
  constructor(readonly retryAfterSeconds: number) {
    super("Too many requests — please wait a moment and try again.");
    this.name = "RateLimitError";
  }
}

/** Pure window math, exported for tests. */
export function windowStart(nowSeconds: number, windowSeconds: number): number {
  return Math.floor(nowSeconds / windowSeconds) * windowSeconds;
}

/**
 * Count `cost` requests against `bucket` for `userId`; throws
 * `RateLimitError` once the window's budget is exceeded. Database errors fail
 * open (logged) so a transient blip never blocks normal use — except for the
 * paid buckets in `FAIL_CLOSED`.
 */
export async function enforceRateLimit(
  userId: string,
  bucket: RateLimitBucket,
  cost = 1,
): Promise<void> {
  const { limit, windowSeconds } = RATE_LIMITS[bucket];
  const now = Math.floor(Date.now() / 1000);
  const start = windowStart(now, windowSeconds);
  const key = `${bucket}:${userId}`;

  let used: number;
  try {
    const db = await getDb();
    const result = await db.execute<{ count: number }>(sql`
      insert into rate_limits (key, count, window_start)
      values (${key}, ${cost}, ${start})
      on conflict (key) do update set
        count = case
          when rate_limits.window_start = excluded.window_start
            then rate_limits.count + excluded.count
          else excluded.count
        end,
        window_start = excluded.window_start
      returning count
    `);
    used = Number(result.rows[0]?.count ?? 0);
  } catch (err) {
    if (FAIL_CLOSED.has(bucket)) {
      console.error(`[rate-limit] check failed, refusing paid "${bucket}" request:`, err);
      throw new RateLimitError(60);
    }
    console.warn("[rate-limit] check failed, allowing request:", err);
    return;
  }

  if (used > limit) throw new RateLimitError(start + windowSeconds - now);
}
