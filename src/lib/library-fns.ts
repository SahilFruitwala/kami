import { and, asc, count, desc, eq, or, sql } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import {
  MAX_CACHED_SNAPSHOT_BYTES,
  approxJsonBytes,
  CacheTTL,
  cacheKey,
  cached,
  hashKeyPart,
  invalidateUserCache,
} from "@/lib/cache.server.ts";
import { getDb } from "@/lib/db";
import { articles, folders } from "@/lib/schema";
import type { LibraryItem, Folder } from "@/lib/store";
import { normalizeTag, uid } from "@/lib/store";
import {
  articleListColumns,
  clampLibraryItemInput,
  highlightOpSchema,
  highlightSchema,
  libraryItemSchema,
  ownedFolderId,
  rowToItem,
  sanitizeStoredHtml,
  tagOpSchema,
} from "@/lib/library-rows.server.ts";
import { applyHighlightOps, applyTagOps } from "@/lib/item-ops.ts";

export type LibrarySnapshot = {
  library: LibraryItem[];
  folders: Folder[];
};

/** Keyset cursor into the `saved_at DESC, id DESC` library ordering. */
export type LibraryCursor = { savedAt: number; id: string };

export type LibraryPage = {
  library: LibraryItem[];
  /** Full folder list on the first page; empty on follow-ups. */
  folders: Folder[];
  /** Null when the end of the library is reached. */
  nextCursor: LibraryCursor | null;
  /** Total article count — computed on the first page only. */
  total: number | null;
};

/** Rows per boot page: enough for an instant first paint, small to serialize. */
export const LIBRARY_BOOT_LIMIT = 100;

export const getLibrary = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    z
      .object({
        limit: z.number().int().min(1).max(200).default(LIBRARY_BOOT_LIMIT),
        cursor: z
          .object({
            savedAt: z.number().int().nonnegative(),
            id: z.string().min(1).max(2000),
          })
          .optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ context, data }): Promise<LibraryPage> => {
    return loadLibraryPage(context.userId, { limit: data.limit, cursor: data.cursor });
  });

/**
 * Keyset-paginated library read: `WHERE user_id` + tuple cursor on
 * `(saved_at, id)` with a matching composite index
 * (`articles_user_saved_idx`, see 0006_library_paging.sql), so every page is
 * an index range scan — no full-library sort/serialize on boot.
 */
async function loadLibraryPage(
  userId: string,
  opts: { limit: number; cursor?: LibraryCursor },
): Promise<LibraryPage> {
  const { limit, cursor } = opts;
  const firstPage = !cursor;
  return cached(
    cacheKey(
      "u",
      userId,
      "library",
      "page",
      String(limit),
      cursor ? `${cursor.savedAt}:${hashKeyPart(cursor.id)}` : "first",
    ),
    CacheTTL.library,
    async (): Promise<LibraryPage> => {
      const db = await getDb();
      const conds = [eq(articles.userId, userId)];
      if (cursor) {
        conds.push(
          sql`(${articles.savedAt}, ${articles.id}) < (${new Date(cursor.savedAt)}, ${cursor.id})`,
        );
      }
      const [folderRows, articleRows, totalRows] = await Promise.all([
        firstPage
          ? db
              .select({ id: folders.id, name: folders.name })
              .from(folders)
              .where(eq(folders.userId, userId))
              .orderBy(asc(folders.createdAt))
          : Promise.resolve([] as { id: string; name: string }[]),
        db
          .select(articleListColumns)
          .from(articles)
          .where(and(...conds))
          .orderBy(desc(articles.savedAt), desc(articles.id))
          .limit(limit + 1),
        firstPage
          ? db
              .select({ value: count() })
              .from(articles)
              .where(eq(articles.userId, userId))
          : Promise.resolve([{ value: 0 }]),
      ]);
      const pageRows = articleRows.slice(0, limit);
      const last = pageRows[pageRows.length - 1];
      return {
        folders: folderRows.map((f) => ({ id: f.id, name: f.name })),
        library: pageRows.map((row) => rowToItem(row)),
        nextCursor:
          articleRows.length > limit && last
            ? {
                savedAt: last.savedAt instanceof Date ? last.savedAt.getTime() : Date.now(),
                id: last.id,
              }
            : null,
        total: firstPage ? Number(totalRows[0]?.value ?? 0) : null,
      };
    },
    { skipCache: (page) => approxJsonBytes(page) > MAX_CACHED_SNAPSHOT_BYTES },
  );
}

/** Full library including article bodies — used for JSON export only. */
export const getLibraryForExport = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<LibrarySnapshot> => {
    const db = await getDb();
    const folderRows = await db
      .select({ id: folders.id, name: folders.name })
      .from(folders)
      .where(eq(folders.userId, context.userId))
      .orderBy(asc(folders.createdAt));
    const articleRows = await db
      .select()
      .from(articles)
      .where(eq(articles.userId, context.userId))
      .orderBy(desc(articles.savedAt));
    return {
      folders: folderRows.map((f) => ({ id: f.id, name: f.name })),
      library: articleRows.map((row) => rowToItem(row, { includeBody: true })),
    };
  });

/** Load a single article body owned by the caller (reader on-demand fetch). */
export const getArticleContent = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: unknown) => z.object({ id: z.string().min(1).max(2000) }).parse(input))
  .handler(async ({ context, data }): Promise<LibraryItem | null> => {
    const db = await getDb();
    const rows = await db
      .select()
      .from(articles)
      .where(and(eq(articles.id, data.id), eq(articles.userId, context.userId)))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return rowToItem(row, { includeBody: true });
  });

export const upsertLibraryItem = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => libraryItemSchema.parse(clampLibraryItemInput(input)))
  .handler(async ({ context, data }): Promise<LibraryItem> => {
    const db = await getDb();
    // Fields are pre-clamped in the validator; keep a defensive pass here so
    // identity fields stay intact and tags/highlights stay bounded.
    const title = data.title.trim().slice(0, 500) || "Untitled";
    const excerpt = data.excerpt.slice(0, 4000);
    const contentHtml = await sanitizeStoredHtml(
      data.contentHtml.slice(0, 1_500_000),
      data.canonicalUrl || data.url,
    );
    const heroImage = data.heroImage && data.heroImage.length <= 2000 ? data.heroImage : null;
    const author = data.author.slice(0, 300);
    const siteName = data.siteName.slice(0, 200);
    const note = data.note.slice(0, 2000);
    const tags = data.tags.map(normalizeTag).filter(Boolean).slice(0, 12);
    const highlights = data.highlights.slice(0, 80);
    const savedAt = new Date(data.savedAt);
    const folderId = await ownedFolderId(db, context.userId, data.folderId);

    const findExisting = async () =>
      (
        await db
          .select({ id: articles.id, contentHtml: articles.contentHtml })
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
          .limit(1)
      )[0];

    const updateExisting = async (row: { id: string; contentHtml: string }) => {
      // Lean client snapshots omit bodies (`contentHtml: ""`). Never clobber a
      // stored article body with an empty upsert from metadata-only sync.
      const bodyHtml = contentHtml.trim() || row.contentHtml || "";
      const [updated] = await db
        .update(articles)
        .set({
          url: data.url,
          canonicalUrl: data.canonicalUrl,
          title,
          author,
          siteName,
          source: data.source,
          wordCount: data.wordCount,
          readingMinutes: data.readingMinutes,
          excerpt,
          contentHtml: bodyHtml,
          heroImage,
          published: data.published,
          archived: data.archived,
          favorited: data.favorited,
          note,
          folderId,
          tags,
          highlights,
        })
        .where(and(eq(articles.id, row.id), eq(articles.userId, context.userId)))
        .returning();
      await invalidateUserCache(context.userId);
      return rowToItem(updated!, { includeBody: true });
    };

    const existing = await findExisting();
    if (existing) return updateExisting(existing);

    // `articles.id` is a global primary key, while article uniqueness is
    // intentionally per-user. Extractors use the URL as the initial id, so
    // another user saving the same URL may already own that id. Preserve the
    // URL id when available; otherwise mint an opaque id for this user's row.
    //
    // The insert is conflict-tolerant: a concurrent save of the same work
    // (double-click, two tabs) loses the race on the (user, canonical_url)
    // unique index and falls back to updating the winner's row instead of
    // surfacing a unique-violation error.
    let id = data.id;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const inserted = await db
        .insert(articles)
        .values({
          id,
          userId: context.userId,
          url: data.url,
          canonicalUrl: data.canonicalUrl,
          title,
          author,
          siteName,
          source: data.source,
          wordCount: data.wordCount,
          readingMinutes: data.readingMinutes,
          excerpt,
          contentHtml,
          heroImage,
          published: data.published,
          savedAt,
          archived: data.archived,
          favorited: data.favorited,
          note,
          folderId,
          tags,
          highlights,
        })
        .onConflictDoNothing()
        .returning({ id: articles.id });
      if (inserted[0]) break;
      const raced = await findExisting();
      if (raced) return updateExisting(raced);
      // Conflict was on the global id (another user owns it) — mint a new one.
      id = uid();
      if (attempt === 2) throw new Error("Could not save this work. Please try again.");
    }

    await invalidateUserCache(context.userId);
    return {
      ...data,
      id,
      title,
      author,
      siteName,
      excerpt,
      contentHtml,
      heroImage,
      note,
      tags,
      highlights,
      folderId,
    };
  });

export const patchLibraryItem = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    z
      .object({
        id: z.string().min(1).max(2000),
        archived: z.boolean().optional(),
        favorited: z.boolean().optional(),
        note: z.string().max(2000).optional(),
        folderId: z.string().max(200).nullable().optional(),
        /** Full replacement — prefer `tagOps` so concurrent edits merge. */
        tags: z.array(z.string().max(28)).max(12).optional(),
        /** Full replacement — prefer `highlightOps` so concurrent edits merge. */
        highlights: z.array(highlightSchema).max(80).optional(),
        tagOps: z.array(tagOpSchema).max(50).optional(),
        highlightOps: z.array(highlightOpSchema).max(50).optional(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }): Promise<LibraryItem | null> => {
    const db = await getDb();
    const folderId =
      data.folderId !== undefined
        ? await ownedFolderId(db, context.userId, data.folderId)
        : undefined;

    // Read-modify-write under a row lock: two concurrent patches to the same
    // work serialize, so ops always apply to the latest tags/highlights.
    const next = await db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(articles)
        .where(and(eq(articles.id, data.id), eq(articles.userId, context.userId)))
        .limit(1)
        .for("update");
      if (!current) return null;

      const item = rowToItem(current, { includeBody: true });
      if (data.archived !== undefined) item.archived = data.archived;
      if (data.favorited !== undefined) item.favorited = data.favorited;
      if (data.note !== undefined) item.note = data.note.slice(0, 2000);
      if (folderId !== undefined) item.folderId = folderId;
      if (data.tags !== undefined) {
        item.tags = data.tags.map(normalizeTag).filter(Boolean).slice(0, 12);
      }
      if (data.tagOps?.length) item.tags = applyTagOps(item.tags, data.tagOps);
      if (data.highlights !== undefined) item.highlights = data.highlights.slice(0, 80);
      if (data.highlightOps?.length) {
        item.highlights = applyHighlightOps(item.highlights, data.highlightOps);
      }

      await tx
        .update(articles)
        .set({
          archived: item.archived,
          favorited: item.favorited,
          note: item.note,
          folderId: item.folderId,
          tags: item.tags,
          highlights: item.highlights,
        })
        .where(and(eq(articles.id, data.id), eq(articles.userId, context.userId)));
      return item;
    });
    if (next) await invalidateUserCache(context.userId);
    return next;
  });

export const removeLibraryItem = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => z.object({ id: z.string().min(1).max(2000) }).parse(input))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const db = await getDb();
    await db
      .delete(articles)
      .where(and(eq(articles.id, data.id), eq(articles.userId, context.userId)));
    await invalidateUserCache(context.userId);
    return { ok: true };
  });
