import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
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
    index("articles_user_id_idx").on(t.userId),
    index("articles_user_archived_idx").on(t.userId, t.archived),
    uniqueIndex("articles_user_canonical_uidx").on(t.userId, t.canonicalUrl),
  ],
);

export const schema = {
  user,
  folders,
  articles,
};

export type User = typeof user.$inferSelect;
export type FolderRow = typeof folders.$inferSelect;
export type ArticleRow = typeof articles.$inferSelect;
