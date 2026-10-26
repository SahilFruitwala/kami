import "@tanstack/react-start/server-only";
import { and, asc, count, desc, eq, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  LIBRARY_BOOT_LIMIT,
  type LibraryCursor,
  type LibraryPage,
  type LibrarySnapshot,
} from "@/lib/api/types";
import {
  MAX_CACHED_SNAPSHOT_BYTES,
  approxJsonBytes,
  CacheTTL,
  userFeatureKey,
  cached,
  hashKeyPart,
  invalidateUserCache,
} from "@/lib/cache.server.ts";
import { getDb } from "@/lib/db.server";
import { articleImageTargets, imageStore, warmImages } from "@/lib/image-store.server.ts";
import { articles, folders } from "@/lib/schema";
import {
  LIBRARY_LIMITS as L,
  clampLibraryItem,
  normalizeTag,
  type LibraryItem,
} from "@/lib/library-item";
import { uid } from "@/lib/id";
import { runInBackground } from "@/server/background";
import {
  libraryItemBody,
  libraryItemPatch,
  libraryTagOpBody,
  type libraryItemSchema,
} from "@/lib/api/schemas/library";
import {
  articleListColumns,
  ownedFolderId,
  rowToItem,
  sanitizeStoredHtml,
} from "@/lib/library-rows.server.ts";
import { applyHighlightOps, applyTagOps } from "@/lib/item-ops.ts";
import { asTidyState, onSave } from "@/lib/tidy-state";
import { conflict, notFound } from "@/server/http";

export const articleIdParams = z.object({ id: z.string().min(1).max(L.id) });

/** `GET /api/library?limit=&cursorSavedAt=&cursorId=` */
export const libraryPageQuery = z
  .object({
    limit: z.coerce.number().int().min(1).max(200).default(LIBRARY_BOOT_LIMIT),
    cursorSavedAt: z.coerce.number().int().nonnegative().optional(),
    cursorId: z.string().min(1).max(L.id).optional(),
  })
  .transform(({ limit, cursorSavedAt, cursorId }) => ({
    limit,
    cursor:
      cursorSavedAt !== undefined && cursorId !== undefined
        ? { savedAt: cursorSavedAt, id: cursorId }
        : undefined,
  }));

export { libraryItemBody, libraryItemPatch, libraryTagOpBody };

/**
 * Keyset-paginated library read: `WHERE user_id` + tuple cursor on
 * `(saved_at, id)` with a matching composite index
 * (`articles_user_saved_idx`, see 0006_library_paging.sql), so every page is
 * an index range scan — no full-library sort/serialize on boot.
 */
export async function loadLibraryPage(
  userId: string,
  opts: { limit: number; cursor?: LibraryCursor },
): Promise<LibraryPage> {
  const { limit, cursor } = opts;
  const firstPage = !cursor;
  return cached(
    userFeatureKey(
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
          ? db.select({ value: count() }).from(articles).where(eq(articles.userId, userId))
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
export async function exportLibrary(userId: string): Promise<LibrarySnapshot> {
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
    library: articleRows.map((row) => rowToItem(row, { includeBody: true })),
  };
}

/** A single article body owned by the caller (reader on-demand fetch). */
export async function getArticle(userId: string, id: string): Promise<LibraryItem> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(articles)
    .where(and(eq(articles.id, id), eq(articles.userId, userId)))
    .limit(1);
  const row = rows[0];
  if (!row) throw notFound("Article not found");
  return rowToItem(row, { includeBody: true });
}

/**
 * Copy an article's images into R2 after the response, so they outlive the
 * source. Only for a new body: lean snapshots and echoes send none.
 */
function keepArticleImages(contentHtml: string, heroImage: string | null | undefined): void {
  const store = imageStore();
  const targets = articleImageTargets(contentHtml, heroImage);
  if (!store || !targets.length) return;
  runInBackground("image-store", () => warmImages(store, targets));
}

/**
 * Insert-or-update a work by id / canonical URL / URL. Returns the canonical
 * server row, whose id may differ from the one sent (URL match).
 */
export async function upsertLibraryItem(
  userId: string,
  data: z.output<typeof libraryItemSchema>,
): Promise<LibraryItem> {
  const db = await getDb();
  // `libraryItemBody` already clamps; callers that build `data` themselves
  // (save, bulk) get the same clamp here.
  const item: LibraryItem = data;
  const clamped = clampLibraryItem(item);
  const { title, excerpt, heroImage, author, siteName, note, highlights } = clamped;
  const contentHtml = await sanitizeStoredHtml(clamped.contentHtml, data.canonicalUrl || data.url);
  const tags = clamped.tags.map(normalizeTag).filter(Boolean);
  const savedAt = new Date(data.savedAt);
  const folderId = await ownedFolderId(db, userId, data.folderId);

  const findExisting = async () =>
    (
      await db
        .select({
          id: articles.id,
          contentHtml: articles.contentHtml,
          originalHtml: articles.originalHtml,
          tidyState: articles.tidyState,
        })
        .from(articles)
        .where(
          and(
            eq(articles.userId, userId),
            or(
              eq(articles.id, data.id),
              eq(articles.canonicalUrl, data.canonicalUrl),
              eq(articles.url, data.url),
            ),
          ),
        )
        .limit(1)
    )[0];

  const updateExisting = async (row: {
    id: string;
    contentHtml: string;
    originalHtml: string | null;
    tidyState: string;
  }) => {
    // Lean client snapshots omit bodies (`contentHtml: ""`), and clients echo
    // back bodies loaded before a background Tidy: neither may clobber the
    // stored copy. Only a genuinely new body resets Tidy (see onSave).
    const body = onSave(
      {
        contentHtml: row.contentHtml || "",
        originalHtml: row.originalHtml,
        tidyState: asTidyState(row.tidyState),
      },
      contentHtml,
    );
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
        contentHtml: body.contentHtml,
        originalHtml: body.originalHtml,
        tidyState: body.tidyState,
        heroImage,
        published: data.published,
        archived: data.archived,
        favorited: data.favorited,
        note,
        folderId,
        tags,
        highlights,
      })
      .where(and(eq(articles.id, row.id), eq(articles.userId, userId)))
      .returning();
    await invalidateUserCache(userId, "library");
    if (contentHtml && contentHtml !== row.contentHtml) keepArticleImages(contentHtml, heroImage);
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
        userId: userId,
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
    if (attempt === 2) throw conflict("Could not save this work. Please try again.");
  }

  await invalidateUserCache(userId, "library");
  keepArticleImages(contentHtml, heroImage);
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
}

/** Partial update; tag/highlight ops merge under a row lock. */
export async function patchLibraryItem(
  userId: string,
  id: string,
  data: z.output<typeof libraryItemPatch>,
): Promise<LibraryItem> {
  const db = await getDb();
  const folderId =
    data.folderId !== undefined ? await ownedFolderId(db, userId, data.folderId) : undefined;

  // Read-modify-write under a row lock: two concurrent patches to the same
  // work serialize, so ops always apply to the latest tags/highlights.
  const next = await db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(articles)
      .where(and(eq(articles.id, id), eq(articles.userId, userId)))
      .limit(1)
      .for("update");
    if (!current) return null;

    const item = rowToItem(current, { includeBody: true });
    if (data.archived !== undefined) item.archived = data.archived;
    if (data.favorited !== undefined) item.favorited = data.favorited;
    if (data.note !== undefined) item.note = data.note;
    if (folderId !== undefined) item.folderId = folderId;
    if (data.tags !== undefined) {
      item.tags = data.tags.map(normalizeTag).filter(Boolean);
    }
    if (data.tagOps?.length) item.tags = applyTagOps(item.tags, data.tagOps);
    if (data.highlights !== undefined) item.highlights = data.highlights;
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
      .where(and(eq(articles.id, id), eq(articles.userId, userId)));
    return item;
  });
  if (!next) throw notFound("Article not found");
  await invalidateUserCache(userId, "library");
  return next;
}

export async function removeLibraryItem(userId: string, id: string): Promise<void> {
  const db = await getDb();
  // Narrations cascade in Postgres; their R2 audio and reservations don't.
  const { prepareArticleDelete } = await import("@/server/services/narration");
  const afterDelete = await prepareArticleDelete(userId, [id]);
  await db.delete(articles).where(and(eq(articles.id, id), eq(articles.userId, userId)));
  await invalidateUserCache(userId, "library");
  await afterDelete();
}

/**
 * Rename or remove a tag on every article that carries it (case-insensitive),
 * in one transaction. Covers rows the client hasn't paged in yet.
 */
export async function applyTagOpEverywhere(
  userId: string,
  op: z.output<typeof libraryTagOpBody>,
): Promise<{ affected: number }> {
  const db = await getDb();
  const tag = op.op === "rename" ? op.from : op.tag;
  if (!tag) return { affected: 0 };
  const affected = await db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: articles.id, tags: articles.tags })
      .from(articles)
      .where(
        and(
          eq(articles.userId, userId),
          sql`exists (select 1 from jsonb_array_elements_text(${articles.tags}) t where lower(t) = lower(${tag}))`,
        ),
      )
      .for("update");
    for (const row of rows) {
      await tx
        .update(articles)
        .set({ tags: applyTagOps(row.tags ?? [], [op]) })
        .where(and(eq(articles.id, row.id), eq(articles.userId, userId)));
    }
    return rows.length;
  });
  if (affected > 0) await invalidateUserCache(userId, "library");
  return { affected };
}
