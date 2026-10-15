import "@tanstack/react-start/server-only";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { DOMParser } from "linkedom";
import { z } from "zod";
import {
  addFeedInput,
  inboxInput,
  markAllReadInput,
  markReadInput,
  opmlInput,
  refreshInput,
  renameFeedInput,
} from "@/lib/api/schemas/feeds";
import type {
  EntryArticleResult,
  FeedEntry,
  FeedEntryPage,
  FeedSummary,
  FeedsOverview,
  NewsletterInbox,
} from "@/lib/api/feeds";
import type { ExtractResult } from "@/lib/article-types";
import { getDb, type AppDb } from "@/lib/db.server";
import {
  discoverFeedLinks,
  guessFeedUrls,
  httpUrl,
  parseFeed,
  plainText,
  type ParsedFeed,
} from "@/lib/feed-parse.server.ts";
import { withJitter } from "@/lib/feed-schedule.ts";
import { enforceRateLimit } from "@/lib/rate-limit.server.ts";
import { assertPublicHttpUrl } from "@/lib/safe-url.ts";
import {
  articles,
  feedEntries,
  feedEntryStates,
  feedSubscriptions,
  feeds,
  newsletterInboxes,
} from "@/lib/schema";
import { uid } from "@/lib/id";
import { xmlEscape } from "@/lib/xml.ts";
import { badRequest, notFound, HttpError } from "@/server/http";
import { inboundDomain, newInboxToken } from "@/server/feeds/newsletter";
import {
  decodeFeedBody,
  fetchFeedDocument,
  insertEntries,
  refreshDueFeeds,
} from "@/server/feeds/poller";

/**
 * Feeds: subscriptions, the entry inbox, saving entries into the library, and
 * the private newsletter address. Polling itself lives in `server/feeds/poller`.
 */

export const MAX_SUBSCRIPTIONS = 300;
/** On subscribe, only entries from the last two weeks count as unread. */
const BACKLOG_DAYS = 14;
/** A feed body with at least this many words is saved as-is (no page fetch). */
const FULL_TEXT_MIN_WORDS = 150;

// ---------- Schemas ----------

// Request bodies are shared with the browser client.
export {
  addFeedInput,
  inboxInput,
  markAllReadInput,
  markReadInput,
  opmlInput,
  refreshInput,
  renameFeedInput,
};

export const feedIdParams = z.object({ id: z.string().min(1).max(200) });
export const entriesQuery = z.object({
  view: z.enum(["unread", "all", "saved"]).default("unread"),
  feedId: z.string().max(200).optional(),
  cursorAt: z.coerce.number().int().optional(),
  cursorId: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(40),
});

// ---------- Shared SQL ----------

/** Unread = no per-user mark, fetched after "mark all read", inside the backlog window. */
const unreadSql = sql`(
  st.entry_id is null
  and (s.cleared_at is null or e.fetched_at > s.cleared_at)
  and e.published_at >= s.created_at - make_interval(days => ${BACKLOG_DAYS})
)`;

type SummaryRow = {
  id: string;
  kind: "rss" | "email";
  url: string;
  title: string;
  site_url: string | null;
  last_fetched_at: Date | string | null;
  last_new_entry_at: Date | string | null;
  last_error: string | null;
  unread: number;
};

const ms = (value: Date | string | null): number | null =>
  value == null ? null : new Date(value).getTime();

function toSummary(row: SummaryRow): FeedSummary {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title || (row.kind === "rss" ? hostOf(row.url) : "Newsletter"),
    url: row.kind === "rss" ? row.url : null,
    siteUrl: row.site_url,
    unread: Number(row.unread) || 0,
    lastFetchedAt: ms(row.last_fetched_at),
    lastNewEntryAt: ms(row.last_new_entry_at),
    lastError: row.last_error,
  };
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

async function loadSummaries(db: AppDb, userId: string, feedId?: string): Promise<FeedSummary[]> {
  const result = await db.execute<SummaryRow>(sql`
    select f.id, f.kind, f.url, coalesce(nullif(s.title, ''), f.title) as title, f.site_url,
      f.last_fetched_at, f.last_new_entry_at, f.last_error,
      (
        select count(*)::int from feed_entries e
        left join feed_entry_states st on st.user_id = s.user_id and st.entry_id = e.id
        where e.feed_id = f.id and ${unreadSql}
      ) as unread
    from feed_subscriptions s
    join feeds f on f.id = s.feed_id
    where s.user_id = ${userId} ${feedId ? sql`and f.id = ${feedId}` : sql``}
    order by lower(coalesce(nullif(s.title, ''), f.title)), f.id
  `);
  return result.rows.map(toSummary);
}

async function inboxFor(db: AppDb, userId: string): Promise<NewsletterInbox> {
  const domain = inboundDomain();
  const enabled = Boolean(domain && process.env.INBOUND_EMAIL_SECRET?.trim());
  if (!enabled) return { enabled: false, address: null };
  const row = (
    await db
      .select({ token: newsletterInboxes.token })
      .from(newsletterInboxes)
      .where(eq(newsletterInboxes.userId, userId))
      .limit(1)
  )[0];
  return { enabled, address: row ? `${row.token}@${domain}` : null };
}

// ---------- Overview / subscriptions ----------

export async function getFeedsOverview(userId: string): Promise<FeedsOverview> {
  const db = await getDb();
  const [list, inbox] = await Promise.all([loadSummaries(db, userId), inboxFor(db, userId)]);
  return { feeds: list, inbox };
}

type Resolved = {
  feedUrl: string;
  /** Present when we fetched the document while resolving (saves a poll). */
  parsed: ParsedFeed | null;
  etag: string | null;
  lastModified: string | null;
};

async function existingFeedId(db: AppDb, url: string): Promise<string | null> {
  const row = (
    await db
      .select({ id: feeds.id })
      .from(feeds)
      .where(and(eq(feeds.url, url), eq(feeds.kind, "rss")))
      .limit(1)
  )[0];
  return row?.id ?? null;
}

type Probe =
  { kind: "feed"; resolved: Resolved } | { kind: "html"; html: string; finalUrl: string } | null;

async function probe(url: string, timeoutMs: number): Promise<Probe> {
  try {
    const res = await fetchFeedDocument(url, {}, timeoutMs);
    if (res.status < 200 || res.status >= 300) return null;
    const type = res.headers.get("content-type") ?? "";
    const body = decodeFeedBody(res.bytes, type);
    const parsed = parseFeed(body, res.finalUrl);
    if (parsed) {
      return {
        kind: "feed",
        resolved: {
          feedUrl: res.finalUrl,
          parsed,
          etag: res.headers.get("etag"),
          lastModified: res.headers.get("last-modified"),
        },
      };
    }
    if (/html/i.test(type) || /^\s*</.test(body))
      return { kind: "html", html: body, finalUrl: res.finalUrl };
    return null;
  } catch {
    return null;
  }
}

/**
 * Find the feed behind a URL with as few fetches as possible: known feed →
 * no fetch; the URL itself is a feed → one fetch; else the page's advertised
 * <link rel="alternate"> feeds; else a handful of conventional paths, probed
 * in parallel.
 */
async function resolveFeed(db: AppDb, rawUrl: string): Promise<Resolved | { existingId: string }> {
  let pageUrl: string;
  try {
    pageUrl = assertPublicHttpUrl(rawUrl.includes("://") ? rawUrl : `https://${rawUrl}`).href;
  } catch (err) {
    throw badRequest(err instanceof Error ? err.message : "That URL can't be used.");
  }
  const known = await existingFeedId(db, pageUrl);
  if (known) return { existingId: known };

  const first = await probe(pageUrl, 10_000);
  if (first?.kind === "feed") return first.resolved;

  const base = first?.kind === "html" ? first.finalUrl : pageUrl;
  const advertised = first?.kind === "html" ? discoverFeedLinks(first.html, base).slice(0, 3) : [];
  for (const candidate of advertised) {
    const knownCandidate = await existingFeedId(db, candidate);
    if (knownCandidate) return { existingId: knownCandidate };
    const hit = await probe(candidate, 8_000);
    if (hit?.kind === "feed") return hit.resolved;
  }

  const guesses = guessFeedUrls(base).filter((u) => !advertised.includes(u));
  const probes = await Promise.all(guesses.map((u) => probe(u, 6_000)));
  for (const hit of probes) if (hit?.kind === "feed") return hit.resolved;

  throw badRequest("Couldn't find a feed there. Try the site's RSS or Atom link.");
}

async function subscribe(db: AppDb, userId: string, feedId: string, title?: string | null) {
  const count = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(feedSubscriptions)
    .where(eq(feedSubscriptions.userId, userId));
  if ((count[0]?.n ?? 0) >= MAX_SUBSCRIPTIONS) {
    throw badRequest(`You can follow up to ${MAX_SUBSCRIPTIONS} feeds.`);
  }
  const inserted = await db
    .insert(feedSubscriptions)
    .values({ userId, feedId, title: title || null })
    .onConflictDoNothing()
    .returning({ feedId: feedSubscriptions.feedId });
  return inserted.length > 0;
}

/** Insert a feed row (or reuse the existing one for that URL). */
async function upsertFeed(db: AppDb, resolved: Resolved, fallbackTitle = ""): Promise<string> {
  const p = resolved.parsed;
  const inserted = await db
    .insert(feeds)
    .values({
      id: uid(),
      kind: "rss",
      url: resolved.feedUrl,
      title: (p?.title || fallbackTitle).slice(0, 200),
      siteUrl: p?.siteUrl ?? null,
      etag: resolved.etag,
      lastModified: resolved.lastModified,
      lastFetchedAt: p ? new Date() : null,
      // Already fetched while resolving → next poll after a normal interval;
      // OPML imports (no document yet) are due right away.
      nextFetchAt: p ? new Date(Date.now() + withJitter(60) * 60_000) : new Date(),
    })
    .onConflictDoNothing({ target: feeds.url })
    .returning({ id: feeds.id });
  if (inserted[0]) {
    if (p) {
      const fresh = await insertEntries(db, inserted[0].id, p.entries);
      if (fresh > 0) {
        await db
          .update(feeds)
          .set({ lastNewEntryAt: new Date() })
          .where(eq(feeds.id, inserted[0].id));
      }
    }
    return inserted[0].id;
  }
  const id = await existingFeedId(db, resolved.feedUrl);
  if (!id) throw new HttpError(409, "Could not add that feed. Please try again.");
  return id;
}

export async function addFeed(
  userId: string,
  data: z.output<typeof addFeedInput>,
): Promise<{ feed: FeedSummary; added: boolean }> {
  const db = await getDb();
  const resolved = await resolveFeed(db, data.url);
  const feedId = "existingId" in resolved ? resolved.existingId : await upsertFeed(db, resolved);
  const added = await subscribe(db, userId, feedId);
  const [feed] = await loadSummaries(db, userId, feedId);
  if (!feed) throw notFound("Feed not found");
  return { feed, added };
}

export async function renameFeed(
  userId: string,
  feedId: string,
  data: z.output<typeof renameFeedInput>,
) {
  const db = await getDb();
  const updated = await db
    .update(feedSubscriptions)
    .set({ title: data.title || null })
    .where(and(eq(feedSubscriptions.userId, userId), eq(feedSubscriptions.feedId, feedId)))
    .returning({ feedId: feedSubscriptions.feedId });
  if (!updated[0]) throw notFound("Feed not found");
}

/** Unsubscribe; a feed nobody follows any more is deleted with its entries. */
export async function removeFeed(userId: string, feedId: string) {
  const db = await getDb();
  await db.transaction(async (tx) => {
    const removed = await tx
      .delete(feedSubscriptions)
      .where(and(eq(feedSubscriptions.userId, userId), eq(feedSubscriptions.feedId, feedId)))
      .returning({ feedId: feedSubscriptions.feedId });
    if (!removed[0]) throw notFound("Feed not found");
    await tx.execute(sql`
      delete from feeds
      where id = ${feedId}
        and not exists (select 1 from feed_subscriptions s where s.feed_id = ${feedId})
    `);
  });
}

/**
 * On-demand refresh (there is no scheduled sweep): polls this user's feeds —
 * or one feed — in bounded batches. `remaining` tells the client whether to
 * call again; feeds checked in the last few minutes are never re-polled.
 */
export async function refreshMyFeeds(userId: string, data: z.output<typeof refreshInput>) {
  return refreshDueFeeds({
    userId,
    feedId: data.feedId,
    force: data.force,
    limit: 20,
    concurrency: 5,
    deadlineMs: 6_000,
    timeoutMs: 8_000,
  });
}

/** Global sweep for `/api/hooks/feeds` (not scheduled — call it from any scheduler). */
export async function refreshAllDueFeeds() {
  return refreshDueFeeds({ limit: 80, concurrency: 6, deadlineMs: 25_000, timeoutMs: 10_000 });
}

// ---------- Entries ----------

type EntryRow = {
  id: string;
  feed_id: string;
  feed_title: string;
  feed_kind: "rss" | "email";
  url: string;
  title: string;
  author: string;
  excerpt: string;
  image_url: string | null;
  published_at: Date | string;
  state: "read" | "saved" | null;
  unread: boolean;
};

export async function listEntries(
  userId: string,
  q: z.output<typeof entriesQuery>,
): Promise<FeedEntryPage> {
  const db = await getDb();
  const filter =
    q.view === "unread"
      ? sql`and ${unreadSql}`
      : q.view === "saved"
        ? sql`and st.state = 'saved'`
        : sql``;
  const cursor =
    q.cursorAt != null && q.cursorId
      ? sql`and (e.published_at, e.id) < (${new Date(q.cursorAt).toISOString()}::timestamptz, ${q.cursorId})`
      : sql``;
  const result = await db.execute<EntryRow>(sql`
    select e.id, e.feed_id, coalesce(nullif(s.title, ''), f.title) as feed_title, f.kind as feed_kind,
      e.url, e.title, e.author, e.excerpt, e.image_url, e.published_at, st.state,
      ${unreadSql} as unread
    from feed_subscriptions s
    join feeds f on f.id = s.feed_id
    join feed_entries e on e.feed_id = s.feed_id
    left join feed_entry_states st on st.user_id = s.user_id and st.entry_id = e.id
    where s.user_id = ${userId}
      ${q.feedId ? sql`and s.feed_id = ${q.feedId}` : sql``}
      ${filter}
      ${cursor}
    order by e.published_at desc, e.id desc
    limit ${q.limit + 1}
  `);
  const rows = result.rows.slice(0, q.limit);
  const entries: FeedEntry[] = rows.map((r) => ({
    id: r.id,
    feedId: r.feed_id,
    feedTitle: r.feed_title || "Feed",
    feedKind: r.feed_kind,
    url: r.url,
    title: r.title,
    author: r.author,
    excerpt: r.excerpt,
    imageUrl: r.image_url,
    publishedAt: new Date(r.published_at).getTime(),
    // Entries cleared by "mark all read" / the backlog window read as read.
    state: r.state ?? (r.unread ? null : "read"),
  }));
  const last = entries[entries.length - 1];
  return {
    entries,
    nextCursor: result.rows.length > q.limit && last ? { at: last.publishedAt, id: last.id } : null,
  };
}

/** Entry ids among `ids` that belong to feeds this user follows. */
async function visibleEntryIds(db: AppDb, userId: string, ids: string[]): Promise<string[]> {
  const rows = await db
    .select({ id: feedEntries.id })
    .from(feedEntries)
    .innerJoin(
      feedSubscriptions,
      and(eq(feedSubscriptions.feedId, feedEntries.feedId), eq(feedSubscriptions.userId, userId)),
    )
    .where(inArray(feedEntries.id, ids));
  return rows.map((r) => r.id);
}

export async function markEntriesRead(userId: string, data: z.output<typeof markReadInput>) {
  const db = await getDb();
  const ids = await visibleEntryIds(db, userId, [...new Set(data.ids)]);
  if (ids.length === 0) return;
  // Never downgrade "saved" to "read".
  await db
    .insert(feedEntryStates)
    .values(ids.map((entryId) => ({ userId, entryId, state: "read" as const })))
    .onConflictDoNothing();
}

export async function markAllRead(userId: string, data: z.output<typeof markAllReadInput>) {
  const db = await getDb();
  await db.transaction(async (tx) => {
    const cleared = await tx
      .update(feedSubscriptions)
      .set({ clearedAt: sql`now()` })
      .where(
        and(
          eq(feedSubscriptions.userId, userId),
          data.feedId ? eq(feedSubscriptions.feedId, data.feedId) : undefined,
        ),
      )
      .returning({ feedId: feedSubscriptions.feedId });
    if (cleared.length === 0) return;
    // Explicit "read" marks are now implied by cleared_at — drop them.
    await tx.execute(sql`
      delete from feed_entry_states st
      using feed_entries e
      where st.user_id = ${userId} and st.state = 'read' and st.entry_id = e.id
        and e.feed_id in (${sql.join(
          cleared.map((c) => sql`${c.feedId}`),
          sql`, `,
        )})
        and e.fetched_at <= now()
    `);
  });
}

/**
 * Build a library `Article` for an entry. Full-text feeds are converted from
 * the stored body — no network at all. Teaser-only feeds fetch the page once
 * through the normal extractor (counted against the `extract` rate limit).
 */
/** Id of this user's library work saved from any of `urls`, if one exists. */
async function existingArticleId(
  db: AppDb,
  userId: string,
  urls: string[],
): Promise<string | null> {
  const list = [...new Set(urls.filter(Boolean))];
  if (list.length === 0) return null;
  const row = (
    await db
      .select({ id: articles.id })
      .from(articles)
      .where(
        and(
          eq(articles.userId, userId),
          or(inArray(articles.url, list), inArray(articles.canonicalUrl, list)),
        ),
      )
      .limit(1)
  )[0];
  return row?.id ?? null;
}

/**
 * Either a fresh article to save, or — when the work is already in the
 * library — its id, so the client opens it instead of re-saving over the
 * reader's existing highlights and notes.
 */
export async function entryArticle(userId: string, entryId: string): Promise<EntryArticleResult> {
  const db = await getDb();
  const row = (
    await db
      .select({
        id: feedEntries.id,
        url: feedEntries.url,
        title: feedEntries.title,
        author: feedEntries.author,
        contentHtml: feedEntries.contentHtml,
        imageUrl: feedEntries.imageUrl,
        publishedAt: feedEntries.publishedAt,
        feedTitle: sql<string>`coalesce(nullif(${feedSubscriptions.title}, ''), ${feeds.title})`,
        siteUrl: feeds.siteUrl,
      })
      .from(feedEntries)
      .innerJoin(feeds, eq(feeds.id, feedEntries.feedId))
      .innerJoin(
        feedSubscriptions,
        and(eq(feedSubscriptions.feedId, feedEntries.feedId), eq(feedSubscriptions.userId, userId)),
      )
      .where(eq(feedEntries.id, entryId))
      .limit(1)
  )[0];
  if (!row) throw notFound("Entry not found");

  const markSaved = () =>
    db
      .insert(feedEntryStates)
      .values({ userId, entryId, state: "saved" })
      .onConflictDoUpdate({
        target: [feedEntryStates.userId, feedEntryStates.entryId],
        set: { state: "saved", updatedAt: sql`now()` },
      });

  const pageUrl = httpUrl(row.url);
  const fallbackHref = `https://newsletter.local/${encodeURIComponent(row.id)}`;
  const known = await existingArticleId(db, userId, [pageUrl ?? "", fallbackHref]);
  if (known) {
    await markSaved();
    return { ok: true, existingId: known };
  }

  const { buildArticle, countWords } = await import("@/lib/article-build.server.ts");
  const words = countWords(plainText(row.contentHtml));
  let result: ExtractResult | null = null;

  if (pageUrl && words < FULL_TEXT_MIN_WORDS) {
    await enforceRateLimit(userId, "extract");
    const { extractArticleFromUrl } = await import("@/lib/extract.server.ts");
    const { aiExtractFallback } = await import("@/server/services/ai-extract");
    const extracted = await extractArticleFromUrl(pageUrl, aiExtractFallback(userId));
    if (extracted.ok) result = extracted;
  }

  if (!result && row.contentHtml) {
    const href = pageUrl ?? fallbackHref;
    const article = buildArticle({
      url: href,
      canonicalUrl: href,
      title: row.title,
      author: row.author,
      siteName: row.feedTitle || hostOf(row.siteUrl ?? href),
      published: row.publishedAt.toISOString(),
      contentHtml: row.contentHtml,
      source: "blog",
      heroImage: row.imageUrl,
    });
    if (article) result = { ok: true, article };
  }

  if (!result && pageUrl) {
    const { articleFromLinkOnly } = await import("@/lib/extract.server.ts");
    result = { ok: true, article: articleFromLinkOnly(pageUrl, row.title) };
  }
  if (!result) return { ok: false, error: "This entry has no readable text or link." };
  if (!result.ok) return result;

  await markSaved();
  // Extraction can land on a different canonical URL (redirects, rel=canonical).
  const after = await existingArticleId(db, userId, [
    result.article.url,
    result.article.canonicalUrl,
  ]);
  return after ? { ok: true, existingId: after } : result;
}

// ---------- Newsletter inbox ----------

export async function ensureInbox(
  userId: string,
  data: z.output<typeof inboxInput>,
): Promise<NewsletterInbox> {
  const db = await getDb();
  const current = await inboxFor(db, userId);
  if (!current.enabled) throw new HttpError(503, "Newsletter email isn't set up on this server.");
  if (current.address && !data.rotate) return current;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const token = newInboxToken();
    try {
      await db
        .insert(newsletterInboxes)
        .values({ userId, token })
        .onConflictDoUpdate({
          target: newsletterInboxes.userId,
          set: { token, createdAt: sql`now()` },
        });
      return inboxFor(db, userId);
    } catch (err) {
      // Token collision on the unique index — astronomically rare; retry.
      if (attempt === 2) throw err;
    }
  }
  throw new HttpError(500, "Could not create an address.");
}

// ---------- OPML ----------

/**
 * Import subscriptions from another reader. Feeds are registered without
 * fetching — the poller picks them up over its next runs — so a 200-feed
 * import costs a few inserts, not 200 synchronous fetches.
 */
export async function importOpml(
  userId: string,
  data: z.output<typeof opmlInput>,
): Promise<{ added: number; skipped: number }> {
  const doc = new DOMParser().parseFromString(data.opml, "text/xml") as unknown as Document;
  const outlines = Array.from(doc.getElementsByTagName("outline") ?? []);
  const seen = new Set<string>();
  const items: Array<{ url: string; title: string }> = [];
  for (const el of outlines) {
    const url = httpUrl(el.getAttribute("xmlUrl") ?? el.getAttribute("xmlurl"));
    if (!url || seen.has(url)) continue;
    try {
      assertPublicHttpUrl(url);
    } catch {
      continue;
    }
    seen.add(url);
    items.push({
      url,
      title: (el.getAttribute("title") || el.getAttribute("text") || "").slice(0, 200),
    });
  }
  if (items.length === 0) throw badRequest("No feeds found in that OPML file.");

  const db = await getDb();
  let added = 0;
  let skipped = 0;
  for (const item of items) {
    try {
      // Feed rows are shared by every subscriber, so the OPML's title (user
      // input) goes on this user's subscription; the feed row's own title
      // comes from the feed document on first poll.
      const feedId =
        (await existingFeedId(db, item.url)) ??
        (await upsertFeed(db, { feedUrl: item.url, parsed: null, etag: null, lastModified: null }));
      if (await subscribe(db, userId, feedId, item.title)) added += 1;
      else skipped += 1;
    } catch (err) {
      if (err instanceof HttpError && err.status === 400) {
        skipped += items.length - added - skipped;
        break; // subscription cap reached
      }
      skipped += 1;
    }
  }
  return { added, skipped };
}

export async function exportOpml(userId: string): Promise<Response> {
  const db = await getDb();
  const list = (await loadSummaries(db, userId)).filter((f) => f.kind === "rss" && f.url);
  const body = list
    .map((f) => {
      const title = xmlEscape(f.title);
      const site = f.siteUrl ? ` htmlUrl="${xmlEscape(f.siteUrl)}"` : "";
      return `    <outline type="rss" text="${title}" title="${title}" xmlUrl="${xmlEscape(f.url!)}"${site}/>`;
    })
    .join("\n");
  const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>KAMI feeds</title><dateCreated>${new Date().toUTCString()}</dateCreated></head>
  <body>
${body}
  </body>
</opml>
`;
  return new Response(opml, {
    headers: {
      "content-type": "text/x-opml; charset=utf-8",
      "content-disposition": 'attachment; filename="kami-feeds.opml"',
      "cache-control": "private, no-store",
    },
  });
}
