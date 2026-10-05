import "@tanstack/react-start/server-only";
import { and, eq, sql } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { getDb } from "@/lib/db";
import { safeFetch } from "@/lib/fetch-text.server.ts";
import { parseFeed, type ParsedEntry, type ParsedFeed } from "@/lib/feed-parse.server.ts";
import {
  FEED_LEASE_MIN,
  FEED_MANUAL_MIN_AGE_MIN,
  errorBackoffMinutes,
  maxAgeMinutes,
  nextInterval,
  retryAfterMinutes,
  withJitter,
} from "@/lib/feed-schedule.ts";
import { feedEntries, feeds } from "@/lib/schema";
import { uid } from "@/lib/store";

/**
 * Feed poller — the only code that fetches feeds on a schedule.
 *
 * Load is bounded on every axis:
 *   - feeds are shared, so a feed is polled once no matter how many follow it;
 *   - only feeds with at least one subscriber are ever claimed;
 *   - a claim is a lease (`FOR UPDATE SKIP LOCKED` + pushing next_fetch_at
 *     forward), so overlapping cron runs / tabs never poll the same feed twice;
 *   - conditional GET (ETag / Last-Modified) makes unchanged feeds a 304;
 *   - intervals adapt per feed, errors back off exponentially;
 *   - each run has a feed cap, a concurrency cap and a wall-clock deadline.
 */

export const FEED_ACCEPT =
  "application/rss+xml, application/atom+xml, application/feed+json, application/xml;q=0.9, text/xml;q=0.9, application/json;q=0.8, */*;q=0.5";
export const FEED_MAX_BYTES = 3_000_000;
/** Entries retained per feed (newest by date); older ones are pruned. */
export const FEED_RETAIN_ENTRIES = 100;

type ClaimedFeed = {
  id: string;
  url: string;
  etag: string | null;
  last_modified: string | null;
  interval_minutes: number;
  error_count: number;
  title: string;
};

export type RefreshSummary = { polled: number; newEntries: number; failed: number };

/** Decode with the charset from Content-Type or the XML declaration. */
export function decodeFeedBody(bytes: Uint8Array, contentType: string): string {
  let charset = /charset\s*=\s*"?([^";\s]+)/i.exec(contentType)?.[1];
  if (!charset) {
    const head = new TextDecoder("latin1").decode(bytes.subarray(0, 200));
    charset = /encoding\s*=\s*["']([^"']+)/i.exec(head)?.[1];
  }
  try {
    return new TextDecoder(charset || "utf-8").decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

/** Store parsed entries (dedup on feed + guid). Returns how many were new. */
export async function insertEntries(
  db: AppDb,
  feedId: string,
  entries: ParsedEntry[],
): Promise<number> {
  if (entries.length === 0) return 0;
  const now = Date.now();
  const rows = entries.map((e, i) => ({
    id: uid(),
    feedId,
    guid: e.guid,
    url: e.url.slice(0, 2000),
    title: e.title.slice(0, 500),
    author: e.author,
    excerpt: e.excerpt,
    contentHtml: e.contentHtml,
    imageUrl: e.imageUrl && e.imageUrl.length <= 2000 ? e.imageUrl : null,
    // Undated entries keep document order; future dates (pinned posts) are
    // clamped so they can't squat at the top of the inbox.
    publishedAt: new Date(Math.min(e.publishedAt ?? now - i, now)),
  }));
  const inserted = await db
    .insert(feedEntries)
    .values(rows)
    .onConflictDoNothing({ target: [feedEntries.feedId, feedEntries.guid] })
    .returning({ id: feedEntries.id });
  if (inserted.length > 0) await pruneEntries(db, feedId);
  return inserted.length;
}

export async function pruneEntries(db: AppDb, feedId: string): Promise<void> {
  await db.execute(sql`
    delete from feed_entries
    where feed_id = ${feedId}
      and id in (
        select id from feed_entries
        where feed_id = ${feedId}
        order by published_at desc, id desc
        offset ${FEED_RETAIN_ENTRIES}
      )
  `);
}

async function claimDueFeeds(
  db: AppDb,
  opts: { userId?: string; limit: number; force?: boolean },
): Promise<ClaimedFeed[]> {
  const subscribed = opts.userId
    ? sql`exists (select 1 from feed_subscriptions s where s.feed_id = f.id and s.user_id = ${opts.userId})`
    : sql`exists (select 1 from feed_subscriptions s where s.feed_id = f.id)`;
  // `last_fetched_at` is stamped at claim time, so a manual refresh can't
  // re-claim a feed another request is fetching right now.
  const due = opts.force
    ? sql`(f.next_fetch_at <= now() or f.last_fetched_at is null
           or f.last_fetched_at < now() - make_interval(mins => ${FEED_MANUAL_MIN_AGE_MIN}))`
    : sql`f.next_fetch_at <= now()`;
  const result = await db.execute<ClaimedFeed>(sql`
    update feeds set
      next_fetch_at = now() + make_interval(mins => ${FEED_LEASE_MIN}),
      last_fetched_at = now()
    where id in (
      select f.id from feeds f
      where f.kind = 'rss' and ${due} and ${subscribed}
      order by f.next_fetch_at
      limit ${opts.limit}
      for update skip locked
    )
    returning id, url, etag, last_modified, interval_minutes, error_count, title
  `);
  return result.rows;
}

const minutesFromNow = (minutes: number) => new Date(Date.now() + minutes * 60_000);

async function recordFailure(
  db: AppDb,
  feed: ClaimedFeed,
  message: string,
  retryAfter: number | null,
) {
  const errors = feed.error_count + 1;
  const delay = Math.max(errorBackoffMinutes(errors), retryAfter ?? 0);
  await db
    .update(feeds)
    .set({
      errorCount: errors,
      lastError: message.slice(0, 300),
      nextFetchAt: minutesFromNow(withJitter(delay)),
    })
    .where(eq(feeds.id, feed.id));
}

/** Fetch one feed document (conditional GET when validators are known). */
export async function fetchFeedDocument(
  url: string,
  validators: { etag?: string | null; lastModified?: string | null } = {},
  timeoutMs?: number,
) {
  const headers: Record<string, string> = {};
  if (validators.etag) headers["if-none-match"] = validators.etag;
  if (validators.lastModified) headers["if-modified-since"] = validators.lastModified;
  return safeFetch(url, { accept: FEED_ACCEPT, headers, maxBytes: FEED_MAX_BYTES, timeoutMs });
}

async function pollFeed(db: AppDb, feed: ClaimedFeed, timeoutMs: number): Promise<number> {
  let res: Awaited<ReturnType<typeof fetchFeedDocument>>;
  try {
    res = await fetchFeedDocument(
      feed.url,
      { etag: feed.etag, lastModified: feed.last_modified },
      timeoutMs,
    );
  } catch (err) {
    await recordFailure(db, feed, err instanceof Error ? err.message : "Fetch failed", null);
    throw err;
  }

  const hint = Math.max(
    maxAgeMinutes(res.headers.get("cache-control")) ?? 0,
    retryAfterMinutes(res.headers.get("retry-after")) ?? 0,
  );

  if (res.status === 304) {
    const interval = nextInterval(feed.interval_minutes, 0, hint || null);
    await db
      .update(feeds)
      .set({
        errorCount: 0,
        lastError: null,
        intervalMinutes: interval,
        nextFetchAt: minutesFromNow(withJitter(interval)),
      })
      .where(eq(feeds.id, feed.id));
    return 0;
  }

  if (res.status < 200 || res.status >= 300) {
    const message =
      res.status === 404 || res.status === 410
        ? "The feed is gone (not found)."
        : `The feed returned ${res.status}.`;
    await recordFailure(db, feed, message, retryAfterMinutes(res.headers.get("retry-after")));
    throw new Error(message);
  }

  const parsed = parseFeed(
    decodeFeedBody(res.bytes, res.headers.get("content-type") ?? ""),
    res.finalUrl,
  );
  if (!parsed) {
    await recordFailure(db, feed, "The address no longer serves a feed.", null);
    throw new Error("Not a feed");
  }

  const fresh = await insertEntries(db, feed.id, parsed.entries);
  const interval = nextInterval(
    feed.interval_minutes,
    fresh,
    Math.max(hint, parsed.ttlMinutes ?? 0) || null,
  );
  await db
    .update(feeds)
    .set({
      title: parsed.title || feed.title,
      siteUrl: parsed.siteUrl,
      etag: res.headers.get("etag"),
      lastModified: res.headers.get("last-modified"),
      errorCount: 0,
      lastError: null,
      intervalMinutes: interval,
      nextFetchAt: minutesFromNow(withJitter(interval)),
      ...(fresh > 0 ? { lastNewEntryAt: new Date() } : {}),
    })
    .where(eq(feeds.id, feed.id));

  // Follow permanent moves when no other feed row already owns the new URL.
  if (res.permanentRedirect && res.finalUrl !== feed.url) {
    await db
      .update(feeds)
      .set({ url: res.finalUrl })
      .where(
        and(
          eq(feeds.id, feed.id),
          sql`not exists (select 1 from feeds other where other.url = ${res.finalUrl})`,
        ),
      )
      .catch(() => undefined);
  }
  return fresh;
}

/** Run `task` over `items` with at most `limit` in flight. */
async function eachLimited<T>(items: T[], limit: number, task: (item: T) => Promise<void>) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++]!;
      await task(item);
    }
  });
  await Promise.all(workers);
}

/**
 * Poll due feeds. `userId` limits the run to that user's subscriptions
 * (opening the Feeds page); omit it for the global cron sweep.
 */
export async function refreshDueFeeds(opts: {
  userId?: string;
  limit: number;
  concurrency: number;
  /** Stop starting new fetches after this many ms (in-flight ones finish). */
  deadlineMs: number;
  timeoutMs: number;
  force?: boolean;
}): Promise<RefreshSummary> {
  const db = await getDb();
  const startedAt = Date.now();
  const claimed = await claimDueFeeds(db, opts);
  const summary: RefreshSummary = { polled: 0, newEntries: 0, failed: 0 };
  const skipped: string[] = [];

  await eachLimited(claimed, opts.concurrency, async (feed) => {
    if (Date.now() - startedAt > opts.deadlineMs) {
      skipped.push(feed.id);
      return;
    }
    try {
      summary.newEntries += await pollFeed(db, feed, opts.timeoutMs);
      summary.polled += 1;
    } catch {
      summary.failed += 1;
    }
  });

  // Release leases we never used so those feeds stay due for the next run.
  if (skipped.length > 0) {
    await db.execute(sql`
      update feeds set next_fetch_at = now()
      where id in (${sql.join(
        skipped.map((id) => sql`${id}`),
        sql`, `,
      )})
    `);
  }
  return summary;
}

export type { ParsedFeed };
