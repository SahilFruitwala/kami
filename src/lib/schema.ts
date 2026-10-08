import { desc, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Local user mirror for Clerk identities.
 * Clerk owns auth; we keep a row so library tables can FK `user_id`.
 * Legacy Better Auth session/account/verification tables may still exist in
 * older databases but are unused.
 */
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").notNull(),
  image: text("image"),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  purgeAfter: timestamp("purge_after", { withTimezone: true }),
});

/** App tables — snake_case columns match `migrations/0002_library.sql`. */
export const folders = pgTable(
  "folders",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("folders_user_id_idx").on(t.userId)],
);

export const articles = pgTable(
  "articles",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    canonicalUrl: text("canonical_url").notNull(),
    title: text("title").notNull(),
    author: text("author").notNull().default(""),
    siteName: text("site_name").notNull().default(""),
    source: text("source").notNull().default("blog"),
    wordCount: integer("word_count").notNull().default(0),
    readingMinutes: integer("reading_minutes").notNull().default(1),
    excerpt: text("excerpt").notNull().default(""),
    contentHtml: text("content_html").notNull().default(""),
    heroImage: text("hero_image"),
    published: text("published"),
    savedAt: timestamp("saved_at", { withTimezone: true }).notNull().defaultNow(),
    archived: boolean("archived").notNull().default(false),
    favorited: boolean("favorited").notNull().default(false),
    note: text("note").notNull().default(""),
    folderId: text("folder_id").references(() => folders.id, { onDelete: "set null" }),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    highlights: jsonb("highlights").$type<unknown[]>().notNull().default([]),
  },
  (t) => [
    // Covers the boot/listing query (WHERE user_id ORDER BY saved_at DESC,
    // id DESC). Leftmost column also serves plain user_id filters, replacing
    // the old articles_user_id_idx (dropped in 0006_library_paging.sql).
    index("articles_user_saved_idx").on(t.userId, desc(t.savedAt), desc(t.id)),
    index("articles_user_archived_idx").on(t.userId, t.archived),
    uniqueIndex("articles_user_canonical_uidx").on(t.userId, t.canonicalUrl),
  ],
);

export const journalEntries = pgTable(
  "journal_entries",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    text: text("text").notNull().default(""),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("journal_entries_user_id_idx").on(t.userId),
    uniqueIndex("journal_entries_user_date_uidx").on(t.userId, t.date),
  ],
);

export type User = typeof user.$inferSelect;
export type FolderRow = typeof folders.$inferSelect;
export type ArticleRow = typeof articles.$inferSelect;
export type JournalEntryRow = typeof journalEntries.$inferSelect;

// ---------- Shelves (TV / Movies / Books / Places / Restaurants / Wishlist) ----------
// Postgres port of the SQLite shelf app. Snake_case columns keep the import 1:1.

export const ITEM_TYPES = ["restaurant", "movie", "tv", "book", "place", "wishlist"] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export const LIST_TYPES = [...ITEM_TYPES, "mixed", "trip"] as const;
export type ListType = (typeof LIST_TYPES)[number];

export const ITEM_STATUSES = ["to_try", "in_progress", "done", "abandoned"] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

export type ItemMetadata = Record<string, string | undefined>;

export const userFeatureFlags = pgTable("user_feature_flags", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  sharing: boolean("sharing").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  windowStart: integer("window_start").notNull(),
});

export const lists = pgTable(
  "lists",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    type: text("type").notNull().$type<ListType>(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    joinCode: text("join_code").unique(),
    viewCode: text("view_code").unique(),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("lists_owner_idx").on(t.ownerId)],
);

export const listMembers = pgTable(
  "list_members",
  {
    id: text("id").primaryKey(),
    listId: text("list_id")
      .notNull()
      .references(() => lists.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("editor").$type<"owner" | "editor">(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("list_members_list_idx").on(t.listId), index("list_members_user_idx").on(t.userId)],
);

function shelfBase() {
  return {
    id: text("id").primaryKey(),
    listId: text("list_id")
      .notNull()
      .references(() => lists.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    normalizedTitle: text("normalized_title"),
    notes: text("notes"),
    link: text("link"),
    imageUrl: text("image_url"),
    status: text("status").notNull().default("to_try").$type<ItemStatus>(),
    groupName: text("group_name"),
    extraMetadata: jsonb("extra_metadata").$type<ItemMetadata>().notNull().default({}),
    addedBy: text("added_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  };
}

export const restaurants = pgTable("restaurants", {
  ...shelfBase(),
  cuisine: text("cuisine"),
  address: text("address"),
  price: text("price"),
  rating: text("rating"),
  kind: text("kind"),
  latitude: text("latitude"),
  longitude: text("longitude"),
});

export const movies = pgTable(
  "movies",
  {
    ...shelfBase(),
    releaseYear: integer("release_year"),
    overview: text("overview"),
    tmdbId: integer("tmdb_id"),
  },
  (t) => [
    uniqueIndex("movies_list_tmdb_uidx")
      .on(t.listId, t.tmdbId)
      .where(sql`${t.tmdbId} is not null`),
    uniqueIndex("movies_list_normalized_title_uidx")
      .on(t.listId, t.normalizedTitle)
      .where(sql`${t.normalizedTitle} is not null and ${t.normalizedTitle} <> ''`),
  ],
);

export const tvShows = pgTable(
  "tv_shows",
  {
    ...shelfBase(),
    releaseYear: integer("release_year"),
    overview: text("overview"),
    tmdbId: integer("tmdb_id"),
    episodesWatched: integer("episodes_watched").notNull().default(0),
    lastEpisode: text("last_episode"),
    totalEpisodes: integer("total_episodes"),
  },
  (t) => [
    uniqueIndex("tv_shows_list_tmdb_uidx")
      .on(t.listId, t.tmdbId)
      .where(sql`${t.tmdbId} is not null`),
    uniqueIndex("tv_shows_list_normalized_title_uidx")
      .on(t.listId, t.normalizedTitle)
      .where(sql`${t.normalizedTitle} is not null and ${t.normalizedTitle} <> ''`),
  ],
);

export const books = pgTable("books", {
  ...shelfBase(),
  author: text("author"),
  publishYear: integer("publish_year"),
  overview: text("overview"),
  currentPage: integer("current_page"),
  pageCount: integer("page_count"),
  progressPercent: integer("progress_percent").notNull().default(0),
});

export const places = pgTable("places", {
  ...shelfBase(),
  address: text("address"),
  rating: text("rating"),
  price: text("price"),
  kind: text("kind"),
  latitude: text("latitude"),
  longitude: text("longitude"),
});

export const wishlistItems = pgTable("wishlist_items", {
  ...shelfBase(),
  price: text("price"),
  description: text("description"),
  source: text("source"),
});

export const genres = pgTable("genres", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  normalizedName: text("normalized_name").notNull().unique(),
});

export const movieGenres = pgTable(
  "movie_genres",
  {
    movieId: text("movie_id")
      .notNull()
      .references(() => movies.id, { onDelete: "cascade" }),
    genreId: text("genre_id")
      .notNull()
      .references(() => genres.id, { onDelete: "cascade" }),
  },
  (t) => [uniqueIndex("movie_genres_movie_genre_uidx").on(t.movieId, t.genreId)],
);

export const tvShowGenres = pgTable(
  "tv_show_genres",
  {
    tvShowId: text("tv_show_id")
      .notNull()
      .references(() => tvShows.id, { onDelete: "cascade" }),
    genreId: text("genre_id")
      .notNull()
      .references(() => genres.id, { onDelete: "cascade" }),
  },
  (t) => [uniqueIndex("tv_show_genres_show_genre_uidx").on(t.tvShowId, t.genreId)],
);

export const bookGenres = pgTable(
  "book_genres",
  {
    bookId: text("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    genreId: text("genre_id")
      .notNull()
      .references(() => genres.id, { onDelete: "cascade" }),
  },
  (t) => [uniqueIndex("book_genres_book_genre_uidx").on(t.bookId, t.genreId)],
);

export const ACTIVITY_ACTIONS = [
  "added",
  "completed",
  "abandoned",
  "reverted",
  "removed",
  "joined",
] as const;
export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];

export const activity = pgTable(
  "activity",
  {
    id: text("id").primaryKey(),
    listId: text("list_id")
      .notNull()
      .references(() => lists.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    action: text("action").notNull().$type<ActivityAction>(),
    itemTitle: text("item_title"),
    itemType: text("item_type").$type<ItemType>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("activity_list_idx").on(t.listId)],
);

export const itemReactions = pgTable(
  "item_reactions",
  {
    id: text("id").primaryKey(),
    itemId: text("item_id").notNull(),
    itemType: text("item_type").notNull().$type<ItemType>(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("item_reactions_item_idx").on(t.itemType, t.itemId),
    uniqueIndex("item_reactions_item_user_uidx").on(t.itemId, t.userId),
  ],
);

export const watchedEpisodes = pgTable(
  "watched_episodes",
  {
    id: text("id").primaryKey(),
    itemId: text("item_id")
      .notNull()
      .references(() => tvShows.id, { onDelete: "cascade" }),
    season: integer("season").notNull(),
    number: integer("number").notNull(),
    watchedAt: timestamp("watched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("watched_episodes_item_idx").on(t.itemId),
    uniqueIndex("watched_episodes_item_ep_uidx").on(t.itemId, t.season, t.number),
  ],
);

export type ShelfList = typeof lists.$inferSelect;
export type ShelfMovie = typeof movies.$inferSelect;
export type ShelfTvShow = typeof tvShows.$inferSelect;
export type ShelfBook = typeof books.$inferSelect;
export type ShelfWishlistItem = typeof wishlistItems.$inferSelect;

// ---------- Feeds (RSS / Atom / JSON Feed + email newsletters) ----------
// Snake_case columns match `migrations/0009_feeds.sql`.

export const FEED_KINDS = ["rss", "email"] as const;
export type FeedKind = (typeof FEED_KINDS)[number];

export const feeds = pgTable(
  "feeds",
  {
    id: text("id").primaryKey(),
    kind: text("kind").$type<FeedKind>().notNull().default("rss"),
    url: text("url").notNull(),
    ownerId: text("owner_id").references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull().default(""),
    siteUrl: text("site_url"),
    etag: text("etag"),
    lastModified: text("last_modified"),
    lastFetchedAt: timestamp("last_fetched_at", { withTimezone: true }),
    lastNewEntryAt: timestamp("last_new_entry_at", { withTimezone: true }),
    nextFetchAt: timestamp("next_fetch_at", { withTimezone: true }).notNull().defaultNow(),
    intervalMinutes: integer("interval_minutes").notNull().default(60),
    errorCount: integer("error_count").notNull().default(0),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("feeds_url_uidx").on(t.url), index("feeds_due_idx").on(t.nextFetchAt)],
);

export const feedSubscriptions = pgTable(
  "feed_subscriptions",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    feedId: text("feed_id")
      .notNull()
      .references(() => feeds.id, { onDelete: "cascade" }),
    title: text("title"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    clearedAt: timestamp("cleared_at", { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.feedId] }),
    index("feed_subscriptions_feed_idx").on(t.feedId),
  ],
);

export const feedEntries = pgTable(
  "feed_entries",
  {
    id: text("id").primaryKey(),
    feedId: text("feed_id")
      .notNull()
      .references(() => feeds.id, { onDelete: "cascade" }),
    guid: text("guid").notNull(),
    url: text("url").notNull().default(""),
    title: text("title").notNull().default(""),
    author: text("author").notNull().default(""),
    excerpt: text("excerpt").notNull().default(""),
    contentHtml: text("content_html").notNull().default(""),
    imageUrl: text("image_url"),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("feed_entries_feed_guid_uidx").on(t.feedId, t.guid),
    index("feed_entries_feed_published_idx").on(t.feedId, desc(t.publishedAt), desc(t.id)),
  ],
);

export const feedEntryStates = pgTable(
  "feed_entry_states",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    entryId: text("entry_id")
      .notNull()
      .references(() => feedEntries.id, { onDelete: "cascade" }),
    state: text("state").$type<"read" | "saved">().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.entryId] })],
);

export const newsletterInboxes = pgTable(
  "newsletter_inboxes",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("newsletter_inboxes_token_uidx").on(t.token)],
);

export type FeedRow = typeof feeds.$inferSelect;
export type FeedEntryRow = typeof feedEntries.$inferSelect;

// ---------- Extracts (Firecrawl page questions) ----------
// Snake_case columns match `migrations/0010_extracts.sql`.

export const EXTRACT_RESULT_STATUSES = ["pending", "accepted"] as const;
export type ExtractResultStatus = (typeof EXTRACT_RESULT_STATUSES)[number];

export const extractSources = pgTable(
  "extract_sources",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    url: text("url").notNull(),
    question: text("question").notNull(),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("extract_sources_user_idx").on(t.userId, t.createdAt)],
);

export const extractResults = pgTable(
  "extract_results",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id")
      .notNull()
      .references(() => extractSources.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: text("status").$type<ExtractResultStatus>().notNull().default("pending"),
    markdown: text("markdown").notNull(),
    url: text("url").notNull(),
    question: text("question").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  },
  (t) => [index("extract_results_source_idx").on(t.sourceId, desc(t.createdAt))],
);

export type ExtractSourceRow = typeof extractSources.$inferSelect;
export type ExtractResultRow = typeof extractResults.$inferSelect;

// ---------- Trips (planner: details, hotel shortlist, itinerary) ----------
// Snake_case columns match `migrations/0012_trips.sql`.

export const TRIP_HOTEL_STATUSES = ["shortlisted", "chosen"] as const;
export type TripHotelStatus = (typeof TRIP_HOTEL_STATUSES)[number];
export const TRIP_SLOTS = ["morning", "afternoon", "evening", "night"] as const;
export type TripSlot = (typeof TRIP_SLOTS)[number];

export const trips = pgTable(
  "trips",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    destination: text("destination").notNull(),
    /** `YYYY-MM-DD`; the end date is derived from `dayCount`. */
    startDate: date("start_date", { mode: "string" }),
    dayCount: integer("day_count").notNull().default(3),
    travelers: integer("travelers"),
    budget: text("budget"),
    preferences: text("preferences"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("trips_user_idx").on(t.userId, desc(t.updatedAt))],
);

export const tripHotels = pgTable(
  "trip_hotels",
  {
    id: text("id").primaryKey(),
    tripId: text("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    area: text("area"),
    url: text("url"),
    priceNote: text("price_note"),
    ratingNote: text("rating_note"),
    why: text("why"),
    status: text("status").$type<TripHotelStatus>().notNull().default("shortlisted"),
    sort: integer("sort").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("trip_hotels_trip_idx").on(t.tripId, t.sort)],
);

export const tripItems = pgTable(
  "trip_items",
  {
    id: text("id").primaryKey(),
    tripId: text("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    dayIndex: integer("day_index").notNull(),
    slot: text("slot").$type<TripSlot>().notNull(),
    title: text("title").notNull(),
    place: text("place"),
    url: text("url"),
    notes: text("notes"),
    sort: integer("sort").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("trip_items_trip_idx").on(t.tripId, t.dayIndex, t.sort)],
);

export const tripMessages = pgTable(
  "trip_messages",
  {
    id: text("id").primaryKey(),
    seq: bigint("seq", { mode: "number" }).generatedAlwaysAsIdentity(),
    tripId: text("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").$type<"user" | "assistant">().notNull(),
    /** AI SDK UIMessage parts (text, tool calls + results). */
    parts: jsonb("parts").$type<unknown[]>().notNull(),
    model: text("model"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("trip_messages_trip_idx").on(t.tripId, t.seq)],
);

export type TripRow = typeof trips.$inferSelect;
export type TripHotelRow = typeof tripHotels.$inferSelect;
export type TripItemRow = typeof tripItems.$inferSelect;
export type TripMessageRow = typeof tripMessages.$inferSelect;

export const schema = {
  user,
  folders,
  articles,
  journalEntries,
  userFeatureFlags,
  rateLimits,
  lists,
  listMembers,
  restaurants,
  movies,
  tvShows,
  books,
  places,
  wishlistItems,
  genres,
  movieGenres,
  tvShowGenres,
  bookGenres,
  activity,
  itemReactions,
  watchedEpisodes,
  feeds,
  feedSubscriptions,
  feedEntries,
  feedEntryStates,
  newsletterInboxes,
  extractSources,
  extractResults,
  trips,
  tripHotels,
  tripItems,
  tripMessages,
};
