import type { Article } from "@/lib/article-types";
import { http, seg } from "./client";

export type FeedKind = "rss" | "email";

export type FeedSummary = {
  id: string;
  kind: FeedKind;
  title: string;
  /** Feed document URL (rss only — email feeds are private). */
  url: string | null;
  siteUrl: string | null;
  unread: number;
  lastFetchedAt: number | null;
  lastNewEntryAt: number | null;
  /** Set while the feed is failing; cleared on the next good poll. */
  lastError: string | null;
};

export type NewsletterInbox = {
  /** Server has INBOUND_EMAIL_DOMAIN + a webhook secret configured. */
  enabled: boolean;
  /** This user's private address, once created. */
  address: string | null;
};

export type FeedsOverview = { feeds: FeedSummary[]; inbox: NewsletterInbox };

export type FeedEntryView = "unread" | "all" | "saved";

export type FeedEntry = {
  id: string;
  feedId: string;
  feedTitle: string;
  feedKind: FeedKind;
  url: string;
  title: string;
  author: string;
  excerpt: string;
  imageUrl: string | null;
  publishedAt: number;
  state: "read" | "saved" | null;
};

export type FeedEntryCursor = { at: number; id: string };

export type FeedEntryPage = { entries: FeedEntry[]; nextCursor: FeedEntryCursor | null };

/** A fresh article to save, or the id of the library work it already is. */
export type EntryArticleResult =
  { ok: true; article: Article } | { ok: true; existingId: string } | { ok: false; error: string };

export type RefreshResult = {
  polled: number;
  newEntries: number;
  failed: number;
  /** Feeds still waiting after this batch — call again to continue. */
  remaining: number;
};

const feed = (id: string) => `/api/feeds/${seg(id)}`;
const entry = (id: string) => `/api/feeds/entries/${seg(id)}`;

export const feedsApi = {
  overview: () => http.get<FeedsOverview>("/api/feeds"),

  /** Subscribe by feed URL or any page that advertises one. */
  add: (url: string) => http.post<{ feed: FeedSummary; added: boolean }>("/api/feeds", { url }),

  rename: (id: string, title: string | null) => http.patch<void>(feed(id), { title }),

  remove: (id: string) => http.delete<void>(feed(id)),

  /** Fetch this user's feeds (or one feed) now, one bounded batch per call. */
  refresh: (opts: { force?: boolean; feedId?: string } = {}) =>
    http.post<RefreshResult>("/api/feeds/refresh", opts),

  entries: (opts: {
    view: FeedEntryView;
    feedId?: string;
    cursor?: FeedEntryCursor | null;
    limit?: number;
  }) =>
    http.get<FeedEntryPage>("/api/feeds/entries", {
      view: opts.view,
      feedId: opts.feedId,
      cursorAt: opts.cursor?.at,
      cursorId: opts.cursor?.id,
      limit: opts.limit,
    }),

  markRead: (ids: string[]) => http.post<void>("/api/feeds/entries/read", { ids }),

  markAllRead: (feedId?: string) => http.post<void>("/api/feeds/entries/read-all", { feedId }),

  /** Build a library article from an entry (feed body, or a page fetch when the feed only has a teaser). */
  article: (id: string) => http.post<EntryArticleResult>(`${entry(id)}/article`),

  /** Create (or, with `rotate`, replace) the private newsletter address. */
  inbox: (rotate = false) => http.post<NewsletterInbox>("/api/feeds/inbox", { rotate }),

  importOpml: (opml: string) =>
    http.post<{ added: number; skipped: number }>("/api/feeds/opml", { opml }),

  exportOpmlUrl: "/api/feeds/opml",
};
