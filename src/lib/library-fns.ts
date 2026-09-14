import { and, asc, count, desc, eq, or, sql } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getDb } from "@/lib/db";
import { articles, folders } from "@/lib/schema";
import type { Highlight, HighlightColorId, LibraryItem, Folder } from "@/lib/store";
import { HIGHLIGHT_COLORS, normalizeTag, uid } from "@/lib/store";

const highlightColorIds = HIGHLIGHT_COLORS.map((c) => c.id) as [
  HighlightColorId,
  ...HighlightColorId[],
];

const highlightSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1).max(800),
  note: z.string().max(280).default(""),
  createdAt: z.number(),
  color: z.enum(highlightColorIds).default("amber"),
});

const libraryItemSchema = z.object({
  id: z.string().min(1),
  url: z.string().min(1),
  canonicalUrl: z.string().min(1),
  title: z.string().min(1).max(500),
  author: z.string().max(300).default(""),
  siteName: z.string().max(200).default(""),
  source: z.enum(["blog", "x"]).default("blog"),
  wordCount: z.number().int().nonnegative().default(0),
  readingMinutes: z.number().int().positive().default(1),
  excerpt: z.string().max(4000).default(""),
  contentHtml: z.string().default(""),
  heroImage: z.string().nullable().default(null),
  published: z.string().nullable().default(null),
  savedAt: z.number(),
  archived: z.boolean().default(false),
  tags: z.array(z.string()).max(12).default([]),
  folderId: z.string().nullable().default(null),
  highlights: z.array(highlightSchema).max(80).default([]),
  favorited: z.boolean().default(false),
  note: z.string().max(2000).default(""),
});

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v)).filter(Boolean);
}

function asHighlights(value: unknown): Highlight[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw) => {
      const parsed = highlightSchema.safeParse(raw);
      return parsed.success ? parsed.data : null;
    })
    .filter((h): h is Highlight => Boolean(h));
}

function rowToItem(row: typeof articles.$inferSelect): LibraryItem {
  return {
    id: row.id,
    url: row.url,
    canonicalUrl: row.canonicalUrl,
    title: row.title,
    author: row.author || "",
    siteName: row.siteName || "",
    source: row.source === "x" ? "x" : "blog",
    wordCount: Number(row.wordCount) || 0,
    readingMinutes: Number(row.readingMinutes) || 1,
    excerpt: row.excerpt || "",
    contentHtml: row.contentHtml || "",
    heroImage: row.heroImage,
    published: row.published,
    savedAt: row.savedAt instanceof Date ? row.savedAt.getTime() : Date.now(),
    archived: Boolean(row.archived),
    tags: asStringArray(row.tags).map(normalizeTag).filter(Boolean).slice(0, 12),
    folderId: row.folderId,
    highlights: asHighlights(row.highlights),
    favorited: Boolean(row.favorited),
    note: row.note || "",
  };
}

export type LibrarySnapshot = {
  library: LibraryItem[];
  folders: Folder[];
};

async function loadSnapshot(userId: string): Promise<LibrarySnapshot> {
  const db = await getDb();
  const folderRows = await db
    .select({ id: folders.id, name: folders.name })
    .from(folders)
    .where(eq(folders.userId, userId))
    .orderBy(asc(folders.createdAt));
  const articleRows = await db
    .select()
    .from(articles)
    .where(eq(articles.userId, userId))
    .orderBy(desc(articles.savedAt));
  return {
    folders: folderRows.map((f) => ({ id: f.id, name: f.name })),
    library: articleRows.map(rowToItem),
  };
}

export const getLibrary = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<LibrarySnapshot> => {
    return loadSnapshot(context.userId);
  });

export const upsertLibraryItem = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => libraryItemSchema.parse(input))
  .handler(async ({ context, data }): Promise<LibraryItem> => {
    const db = await getDb();
    const tags = data.tags.map(normalizeTag).filter(Boolean).slice(0, 12);
    const highlights = data.highlights.slice(0, 80);
    const savedAt = new Date(data.savedAt);

    const existing = await db
      .select({ id: articles.id })
      .from(articles)
      .where(
        and(
          eq(articles.userId, context.userId),
          or(
            eq(articles.id, data.id),
            eq(articles.canonicalUrl, data.canonicalUrl),
            eq(articles.url, data.url),
          ),
        ),
      )
      .limit(1);

    if (existing[0]) {
      const id = existing[0].id;
      await db
        .update(articles)
        .set({
          url: data.url,
          canonicalUrl: data.canonicalUrl,
          title: data.title,
          author: data.author,
          siteName: data.siteName,
          source: data.source,
          wordCount: data.wordCount,
          readingMinutes: data.readingMinutes,
          excerpt: data.excerpt,
          contentHtml: data.contentHtml,
          heroImage: data.heroImage,
          published: data.published,
          archived: data.archived,
          favorited: data.favorited,
          note: data.note,
          folderId: data.folderId,
          tags,
          highlights,
        })
        .where(and(eq(articles.id, id), eq(articles.userId, context.userId)));
      const rows = await db
        .select()
        .from(articles)
        .where(and(eq(articles.id, id), eq(articles.userId, context.userId)))
        .limit(1);
      return rowToItem(rows[0]!);
    }

    await db.insert(articles).values({
      id: data.id,
      userId: context.userId,
      url: data.url,
      canonicalUrl: data.canonicalUrl,
      title: data.title,
      author: data.author,
      siteName: data.siteName,
      source: data.source,
      wordCount: data.wordCount,
      readingMinutes: data.readingMinutes,
      excerpt: data.excerpt,
      contentHtml: data.contentHtml,
      heroImage: data.heroImage,
      published: data.published,
      savedAt,
      archived: data.archived,
      favorited: data.favorited,
      note: data.note,
      folderId: data.folderId,
      tags,
      highlights,
    });
    return { ...data, tags, highlights };
  });

export const patchLibraryItem = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    z
      .object({
        id: z.string().min(1),
        archived: z.boolean().optional(),
        favorited: z.boolean().optional(),
        note: z.string().max(2000).optional(),
        folderId: z.string().nullable().optional(),
        tags: z.array(z.string()).max(12).optional(),
        highlights: z.array(highlightSchema).max(80).optional(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }): Promise<LibraryItem | null> => {
    const db = await getDb();
    const current = await db
      .select()
      .from(articles)
      .where(and(eq(articles.id, data.id), eq(articles.userId, context.userId)))
      .limit(1);
    if (!current[0]) return null;

    const next = rowToItem(current[0]);
    if (data.archived !== undefined) next.archived = data.archived;
    if (data.favorited !== undefined) next.favorited = data.favorited;
    if (data.note !== undefined) next.note = data.note.slice(0, 2000);
    if (data.folderId !== undefined) next.folderId = data.folderId;
    if (data.tags !== undefined) {
      next.tags = data.tags.map(normalizeTag).filter(Boolean).slice(0, 12);
    }
    if (data.highlights !== undefined) next.highlights = data.highlights.slice(0, 80);

    await db
      .update(articles)
      .set({
        archived: next.archived,
        favorited: next.favorited,
        note: next.note,
        folderId: next.folderId,
        tags: next.tags,
        highlights: next.highlights,
      })
      .where(and(eq(articles.id, data.id), eq(articles.userId, context.userId)));
    return next;
  });

export const removeLibraryItem = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => z.object({ id: z.string().min(1) }).parse(input))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const db = await getDb();
    await db
      .delete(articles)
      .where(and(eq(articles.id, data.id), eq(articles.userId, context.userId)));
    return { ok: true };
  });

export const addLibraryFolder = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    z
      .object({
        id: z.string().min(1).optional(),
        name: z.string().trim().min(1).max(32),
      })
      .parse(input),
  )
  .handler(async ({ context, data }): Promise<Folder> => {
    const db = await getDb();
    const name = data.name.trim().slice(0, 32);
    const existing = await db
      .select({ id: folders.id, name: folders.name })
      .from(folders)
      .where(
        and(
          eq(folders.userId, context.userId),
          sql`lower(${folders.name}) = lower(${name})`,
        ),
      )
      .limit(1);
    if (existing[0]) return { id: existing[0].id, name: existing[0].name };

    const [{ value: folderCount }] = await db
      .select({ value: count() })
      .from(folders)
      .where(eq(folders.userId, context.userId));
    if (Number(folderCount) >= 24) {
      throw new Error("Folder limit reached.");
    }

    const id = data.id || uid();
    await db
      .insert(folders)
      .values({ id, userId: context.userId, name })
      .onConflictDoUpdate({
        target: folders.id,
        set: { name },
      });
    return { id, name };
  });

export const renameLibraryFolder = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    z.object({ id: z.string().min(1), name: z.string().trim().min(1).max(32) }).parse(input),
  )
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const db = await getDb();
    const name = data.name.trim().slice(0, 32);
    await db
      .update(folders)
      .set({ name })
      .where(and(eq(folders.id, data.id), eq(folders.userId, context.userId)));
    return { ok: true };
  });

export const removeLibraryFolder = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => z.object({ id: z.string().min(1) }).parse(input))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const db = await getDb();
    await db
      .update(articles)
      .set({ folderId: null })
      .where(and(eq(articles.userId, context.userId), eq(articles.folderId, data.id)));
    await db
      .delete(folders)
      .where(and(eq(folders.id, data.id), eq(folders.userId, context.userId)));
    return { ok: true };
  });

export const importLibrarySnapshot = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    z
      .object({
        library: z.array(libraryItemSchema).max(200),
        folders: z.array(z.object({ id: z.string(), name: z.string().min(1).max(32) })).max(24),
      })
      .parse(input),
  )
  .handler(async ({ context, data }): Promise<LibrarySnapshot> => {
    const db = await getDb();
    const [{ value: existingCount }] = await db
      .select({ value: count() })
      .from(articles)
      .where(eq(articles.userId, context.userId));

    // Only import local leftovers when the account library is empty.
    if (Number(existingCount) > 0) {
      return loadSnapshot(context.userId);
    }

    for (const folder of data.folders.slice(0, 24)) {
      await db
        .insert(folders)
        .values({
          id: folder.id,
          userId: context.userId,
          name: folder.name.trim().slice(0, 32),
        })
        .onConflictDoNothing({ target: folders.id });
    }

    for (const item of data.library.slice(0, 200)) {
      const tags = item.tags.map(normalizeTag).filter(Boolean).slice(0, 12);
      const highlights = item.highlights.slice(0, 80);
      await db
        .insert(articles)
        .values({
          id: item.id,
          userId: context.userId,
          url: item.url,
          canonicalUrl: item.canonicalUrl,
          title: item.title,
          author: item.author,
          siteName: item.siteName,
          source: item.source,
          wordCount: item.wordCount,
          readingMinutes: item.readingMinutes,
          excerpt: item.excerpt,
          contentHtml: item.contentHtml,
          heroImage: item.heroImage,
          published: item.published,
          savedAt: new Date(item.savedAt),
          archived: item.archived,
          favorited: item.favorited,
          note: item.note,
          folderId: item.folderId,
          tags,
          highlights,
        })
        .onConflictDoNothing({ target: articles.id });
    }

    return loadSnapshot(context.userId);
  });
