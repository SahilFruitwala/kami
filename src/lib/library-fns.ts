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
import type { Article } from "@/lib/article-types";
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
  color: z.enum(highlightColorIds).default("vermilion"),
});

const libraryItemSchema = z.object({
  // Extracted articles initially use the full URL as their id. The server may
  // replace it with a generated id when that global PK is already used by a
  // different user.
  id: z.string().min(1).max(2000),
  url: z.string().min(1).max(2000),
  canonicalUrl: z.string().min(1).max(2000),
  title: z.string().min(1).max(500),
  author: z.string().max(300).default(""),
  siteName: z.string().max(200).default(""),
  source: z.enum(["blog", "x"]).default("blog"),
  wordCount: z.number().int().nonnegative().max(1_000_000).default(0),
  readingMinutes: z.number().int().positive().max(100_000).default(1),
  excerpt: z.string().max(4000).default(""),
  contentHtml: z.string().max(1_500_000).default(""),
  heroImage: z.string().max(2000).nullable().default(null),
  published: z.string().max(100).nullable().default(null),
  savedAt: z.number(),
  archived: z.boolean().default(false),
  tags: z.array(z.string().max(28)).max(12).default([]),
  folderId: z.string().max(200).nullable().default(null),
  highlights: z.array(highlightSchema).max(80).default([]),
  favorited: z.boolean().default(false),
  note: z.string().max(2000).default(""),
});

/**
 * Clamp extractor fields *before* Zod so an oversize og:image URL or title
 * cannot hard-fail the upsert validator (the handler clamp never ran when
 * parse threw first — Cmd+K / capture looked successful until refresh).
 */
function clampLibraryItemInput(input: unknown): unknown {
  if (!input || typeof input !== "object") return input;
  const o = input as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : v == null ? v : String(v));
  const titleRaw = str(o.title);
  const hero = str(o.heroImage);
  return {
    ...o,
    title: typeof titleRaw === "string" ? titleRaw.trim().slice(0, 500) || "Untitled" : o.title,
    author: typeof o.author === "string" ? o.author.slice(0, 300) : o.author,
    siteName: typeof o.siteName === "string" ? o.siteName.slice(0, 200) : o.siteName,
    excerpt: typeof o.excerpt === "string" ? o.excerpt.slice(0, 4000) : o.excerpt,
    contentHtml:
      typeof o.contentHtml === "string" ? o.contentHtml.slice(0, 1_500_000) : o.contentHtml,
    heroImage: typeof hero === "string" ? (hero.length <= 2000 ? hero : null) : o.heroImage,
    published: typeof o.published === "string" ? o.published.slice(0, 100) : o.published,
    note: typeof o.note === "string" ? o.note.slice(0, 2000) : o.note,
    tags: Array.isArray(o.tags) ? o.tags.slice(0, 12) : o.tags,
    highlights: Array.isArray(o.highlights) ? o.highlights.slice(0, 80) : o.highlights,
  };
}

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

type ArticleListRow = Omit<typeof articles.$inferSelect, "contentHtml"> & {
  contentHtml?: string;
};

function rowToItem(row: ArticleListRow, opts?: { includeBody?: boolean }): LibraryItem {
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
    // List/boot payloads omit bodies by default — fetch via getArticleContent
    // when the reader opens a work (keeps bootstrap small; see loadSnapshot).
    contentHtml: opts?.includeBody ? row.contentHtml || "" : "",
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

/** Columns needed for library chrome / lists — intentionally excludes `contentHtml`. */
const articleListColumns = {
  id: articles.id,
  userId: articles.userId,
  url: articles.url,
  canonicalUrl: articles.canonicalUrl,
  title: articles.title,
  author: articles.author,
  siteName: articles.siteName,
  source: articles.source,
  wordCount: articles.wordCount,
  readingMinutes: articles.readingMinutes,
  excerpt: articles.excerpt,
  heroImage: articles.heroImage,
  published: articles.published,
  savedAt: articles.savedAt,
  archived: articles.archived,
  favorited: articles.favorited,
  note: articles.note,
  folderId: articles.folderId,
  tags: articles.tags,
  highlights: articles.highlights,
} as const;

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

/**
 * Sanitize article HTML before persistence. Extract/import paths already
 * sanitize, but `upsertLibraryItem` accepts client-supplied bodies — never
 * trust those for `dangerouslySetInnerHTML` later.
 */
async function sanitizeStoredHtml(html: string, baseUrl: string): Promise<string> {
  if (!html.trim()) return "";
  const { sanitizeHtml } = await import("./extract.server.ts");
  try {
    return sanitizeHtml(html, baseUrl).slice(0, 1_500_000);
  } catch {
    return "";
  }
}

/**
 * Resolve a client-supplied folder id to one owned by this user (or null).
 * Prevents cross-tenant folder linkage via crafted `folderId` values.
 */
async function ownedFolderId(
  db: Awaited<ReturnType<typeof getDb>>,
  userId: string,
  folderId: string | null,
): Promise<string | null> {
  if (!folderId) return null;
  const rows = await db
    .select({ id: folders.id })
    .from(folders)
    .where(and(eq(folders.id, folderId), eq(folders.userId, userId)))
    .limit(1);
  return rows[0] ? rows[0].id : null;
}

async function loadSnapshot(userId: string): Promise<LibrarySnapshot> {
  // Boot ships metadata only (no `contentHtml`). Bodies are fetched on demand
  // via `getArticleContent` when the reader opens a work — that keeps cold
  // start and Redis entries small even for large libraries.
  return cached(
    cacheKey("u", userId, "library", "snapshot-meta"),
    CacheTTL.library,
    async () => {
      const db = await getDb();
      const folderRows = await db
        .select({ id: folders.id, name: folders.name })
        .from(folders)
        .where(eq(folders.userId, userId))
        .orderBy(asc(folders.createdAt));
      const articleRows = await db
        .select(articleListColumns)
        .from(articles)
        .where(eq(articles.userId, userId))
        .orderBy(desc(articles.savedAt), desc(articles.id));
      return {
        folders: folderRows.map((f) => ({ id: f.id, name: f.name })),
        library: articleRows.map((row) => rowToItem(row)),
      };
    },
    { skipCache: (snap) => approxJsonBytes(snap) > MAX_CACHED_SNAPSHOT_BYTES },
  );
}

export const getLibrary = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    z
      .object({
        limit: z.number().int().min(1).max(200).optional(),
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
    // No limit: legacy full snapshot (kept for compat; boot uses pages).
    if (data.limit == null) {
      const snap = await loadSnapshot(context.userId);
      return {
        library: snap.library,
        folders: snap.folders,
        nextCursor: null,
        total: snap.library.length,
      };
    }
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
      // Lean client snapshots omit bodies (`contentHtml: ""`). Never clobber a
      // stored article body with an empty upsert from metadata-only sync.
      const prior = await db
        .select({ contentHtml: articles.contentHtml })
        .from(articles)
        .where(and(eq(articles.id, id), eq(articles.userId, context.userId)))
        .limit(1);
      const bodyHtml =
        contentHtml.trim() || prior[0]?.contentHtml || "";
      await db
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
        .where(and(eq(articles.id, id), eq(articles.userId, context.userId)));
      const rows = await db
        .select()
        .from(articles)
        .where(and(eq(articles.id, id), eq(articles.userId, context.userId)))
        .limit(1);
      await invalidateUserCache(context.userId);
      return rowToItem(rows[0]!, { includeBody: true });
    }

    // `articles.id` is a global primary key, while article uniqueness is
    // intentionally per-user. Extractors use the URL as the initial id, so
    // another user saving the same URL may already own that id. Preserve the
    // URL id when available; otherwise mint an opaque id for this user's row.
    const idOwner = await db
      .select({ id: articles.id })
      .from(articles)
      .where(eq(articles.id, data.id))
      .limit(1);
    const id = idOwner[0] ? uid() : data.id;

    await db.insert(articles).values({
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
    });
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
        tags: z.array(z.string().max(28)).max(12).optional(),
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

    const next = rowToItem(current[0], { includeBody: true });
    if (data.archived !== undefined) next.archived = data.archived;
    if (data.favorited !== undefined) next.favorited = data.favorited;
    if (data.note !== undefined) next.note = data.note.slice(0, 2000);
    if (data.folderId !== undefined) {
      next.folderId = await ownedFolderId(db, context.userId, data.folderId);
    }
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
    await invalidateUserCache(context.userId);
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

export type BulkSaveLinksResult = {
  saved: LibraryItem[];
  skipped: string[];
  errors: { url: string; error: string }[];
};

/** Bulk extraction budgets: per-URL soft timeout, worker concurrency, and an
 *  overall deadline after which remaining URLs fall back to empty stubs (the
 *  reader upgrades those on open). Keeps bulk responsive without risking the
 *  function timeout for large batches of slow pages. */
const BULK_EXTRACT_CONCURRENCY = 5;
const BULK_PER_URL_MS = 8000;
const BULK_DEADLINE_MS = 25000;

/** Race a promise against a timeout; resolves null on timeout or rejection. */
function bulkSettled<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
    );
  });
}

/**
 * Bulk save links with titles fetched up front: each URL is extracted (bounded
 * concurrency + budgets) so library cards show the real title/excerpt/cover
 * immediately. URLs that fail, time out, or fall past the deadline are stored
 * as empty-body stubs — the reader lazy-extracts those on open. Dedupes
 * against the caller's existing library by URL.
 */
export const bulkSaveLinks = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    z
      .object({ urls: z.array(z.string().trim().min(4).max(2000)).min(1).max(50) })
      .parse(input),
  )
  .handler(async ({ context, data }): Promise<BulkSaveLinksResult> => {
    const { assertPublicHttpUrl } = await import("./safe-url.ts");
    const { extractArticleFromUrl } = await import("./extract.server.ts");
    const { articleToItem } = await import("./store.ts");
    const db = await getDb();
    const saved: LibraryItem[] = [];
    const skipped: string[] = [];
    const errors: { url: string; error: string }[] = [];

    // Phase 1 — validate + dedupe + skip already-saved (cheap sequential queries).
    type Pending = { raw: string; href: string; host: string; index: number };
    const seen = new Set<string>();
    const pending: Pending[] = [];
    const urls = data.urls.map((u) => u.trim()).filter(Boolean);
    const now = Date.now();
    for (let idx = 0; idx < urls.length; idx += 1) {
      const raw = urls[idx]!.slice(0, 2000);
      const key = raw.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      try {
        const pageUrl = assertPublicHttpUrl(raw);
        const href = pageUrl.href;
        const existing = await db
          .select({ id: articles.id })
          .from(articles)
          .where(
            and(
              eq(articles.userId, context.userId),
              or(eq(articles.url, href), eq(articles.canonicalUrl, href)),
            ),
          )
          .limit(1);
        if (existing[0]) {
          skipped.push(raw);
          continue;
        }
        pending.push({ raw, href, host: pageUrl.hostname.replace(/^www\./, ""), index: idx });
      } catch (err) {
        errors.push({ url: raw, error: err instanceof Error ? err.message : "Invalid URL." });
      }
    }

    // Phase 2 — extract clean copies with bounded concurrency. Past the
    // overall deadline, remaining URLs keep null (stub fallback below).
    const found: Array<Article | null> = new Array(pending.length).fill(null);
    const deadline = Date.now() + BULK_DEADLINE_MS;
    let cursor = 0;
    async function worker(): Promise<void> {
      while (cursor < pending.length) {
        const slot = cursor;
        cursor += 1;
        const job = pending[slot]!;
        if (Date.now() > deadline) return;
        const result = await bulkSettled(extractArticleFromUrl(job.href), BULK_PER_URL_MS);
        if (result?.ok) found[slot] = result.article;
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(BULK_EXTRACT_CONCURRENCY, pending.length) }, () =>
        worker(),
      ),
    );

    // Phase 3 — insert rows sequentially.
    for (let slot = 0; slot < pending.length; slot += 1) {
      const job = pending[slot]!;
      const article: Article = found[slot] ?? {
        url: job.href,
        canonicalUrl: job.href,
        title: job.host,
        author: "",
        siteName: job.host,
        published: null,
        excerpt: "",
        contentHtml: "",
        wordCount: 0,
        readingMinutes: 1,
        source: "blog",
        heroImage: null,
      };
      // Mirror the single-upsert clamp so extractor output always fits the row.
      const item = articleToItem(
        {
          url: article.url,
          canonicalUrl: article.canonicalUrl,
          title: article.title.trim().slice(0, 500) || job.host,
          author: article.author.slice(0, 300),
          siteName: article.siteName.slice(0, 200),
          published: article.published ? article.published.slice(0, 100) : null,
          excerpt: article.excerpt.slice(0, 4000),
          contentHtml: article.contentHtml.slice(0, 1_500_000),
          wordCount: article.wordCount,
          readingMinutes: article.readingMinutes,
          source: article.source,
          heroImage:
            article.heroImage && article.heroImage.length <= 2000 ? article.heroImage : null,
        },
        { savedAt: now - job.index },
      );
      const idOwner = await db
        .select({ id: articles.id })
        .from(articles)
        .where(eq(articles.id, item.id))
        .limit(1);
      const id = idOwner[0] ? uid() : item.id;
      const row: LibraryItem = { ...item, id };
      await db.insert(articles).values({
        id,
        userId: context.userId,
        url: row.url,
        canonicalUrl: row.canonicalUrl,
        title: row.title,
        author: row.author,
        siteName: row.siteName,
        source: row.source,
        wordCount: row.wordCount,
        readingMinutes: row.readingMinutes,
        excerpt: row.excerpt,
        contentHtml: row.contentHtml,
        heroImage: row.heroImage,
        published: row.published,
        savedAt: new Date(row.savedAt),
        archived: false,
        favorited: false,
        note: "",
        folderId: null,
        tags: [],
        highlights: [],
      });
      // Strip bodies from the response — the client row hydrates the body from
      // the DB when the work is opened, keeping bulk payloads small.
      saved.push({ ...row, contentHtml: "" });
    }

    if (saved.length > 0) await invalidateUserCache(context.userId);
    return { saved, skipped, errors };
  });

/** Delete every article + folder owned by this user. Scoped by userId —
 *  nothing outside the caller's account is touched. */
export const wipeLibrary = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ ok: true }> => {
    const db = await getDb();
    await db.delete(articles).where(eq(articles.userId, context.userId));
    await db.delete(folders).where(eq(folders.userId, context.userId));
    await invalidateUserCache(context.userId);
    return { ok: true };
  });

export const addLibraryFolder = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    z
      .object({
        id: z.string().min(1).max(200).optional(),
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
      .where(and(eq(folders.userId, context.userId), sql`lower(${folders.name}) = lower(${name})`))
      .limit(1);
    if (existing[0]) return { id: existing[0].id, name: existing[0].name };

    const [{ value: folderCount }] = await db
      .select({ value: count() })
      .from(folders)
      .where(eq(folders.userId, context.userId));
    if (Number(folderCount) >= 24) {
      throw new Error("Folder limit reached.");
    }

    // IDs are a global primary key. Never let a caller-supplied id overwrite a
    // row owned by another user (onConflictDoUpdate without a userId scope
    // would rename a victim's folder). If the id is taken by anyone else,
    // mint a fresh one; only the owner's own retry is idempotent.
    let id = data.id || uid();
    if (data.id) {
      const byId = await db
        .select({ id: folders.id, userId: folders.userId, name: folders.name })
        .from(folders)
        .where(eq(folders.id, data.id))
        .limit(1);
      if (byId[0]) {
        if (byId[0].userId === context.userId) return { id: byId[0].id, name: byId[0].name };
        id = uid();
      }
    }
    await db
      .insert(folders)
      .values({ id, userId: context.userId, name })
      .onConflictDoNothing({ target: folders.id });
    await invalidateUserCache(context.userId);
    // Confirm ownership (a concurrent insert winning the race returns its row
    // only when we own it; otherwise fall back to the name lookup above).
    const owned = await db
      .select({ id: folders.id, name: folders.name })
      .from(folders)
      .where(and(eq(folders.id, id), eq(folders.userId, context.userId)))
      .limit(1);
    if (owned[0]) return { id: owned[0].id, name: owned[0].name };
    return { id, name };
  });

export const renameLibraryFolder = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    z
      .object({ id: z.string().min(1).max(200), name: z.string().trim().min(1).max(32) })
      .parse(input),
  )
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const db = await getDb();
    const name = data.name.trim().slice(0, 32);
    await db
      .update(folders)
      .set({ name })
      .where(and(eq(folders.id, data.id), eq(folders.userId, context.userId)));
    await invalidateUserCache(context.userId);
    return { ok: true };
  });

export const removeLibraryFolder = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => z.object({ id: z.string().min(1).max(200) }).parse(input))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const db = await getDb();
    await db
      .update(articles)
      .set({ folderId: null })
      .where(and(eq(articles.userId, context.userId), eq(articles.folderId, data.id)));
    await db
      .delete(folders)
      .where(and(eq(folders.id, data.id), eq(folders.userId, context.userId)));
    await invalidateUserCache(context.userId);
    return { ok: true };
  });

export const importLibrarySnapshot = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw =
      input && typeof input === "object"
        ? (input as { library?: unknown; folders?: unknown })
        : null;
    return z
      .object({
        library: z.array(libraryItemSchema).max(200),
        folders: z
          .array(z.object({ id: z.string().min(1).max(200), name: z.string().min(1).max(32) }))
          .max(24),
      })
      .parse({
        library: Array.isArray(raw?.library)
          ? raw.library.map(clampLibraryItemInput)
          : raw?.library,
        folders: raw?.folders,
      });
  })
  .handler(async ({ context, data }): Promise<LibrarySnapshot> => {
    const db = await getDb();
    const [{ value: existingCount }] = await db
      .select({ value: count() })
      .from(articles)
      .where(eq(articles.userId, context.userId));

    // Only import local leftovers when the account library is empty.
    // (The tail of this handler invalidates + reloads after writing.)
    if (Number(existingCount) > 0) {
      return loadSnapshot(context.userId);
    }

    for (const folder of data.folders.slice(0, 24)) {
      // Remap ids already taken by another tenant so we never link to (or
      // silently collide with) a foreign folder row.
      const taken = await db
        .select({ id: folders.id, userId: folders.userId })
        .from(folders)
        .where(eq(folders.id, folder.id))
        .limit(1);
      let folderId = folder.id;
      if (taken[0] && taken[0].userId !== context.userId) {
        folderId = uid();
        for (const item of data.library) {
          if (item.folderId === folder.id) item.folderId = folderId;
        }
      }
      await db
        .insert(folders)
        .values({
          id: folderId,
          userId: context.userId,
          name: folder.name.trim().slice(0, 32),
        })
        .onConflictDoNothing({ target: folders.id });
    }

    const ownedFolderIds = new Set(
      (
        await db.select({ id: folders.id }).from(folders).where(eq(folders.userId, context.userId))
      ).map((f) => f.id),
    );

    for (const item of data.library.slice(0, 200)) {
      const tags = item.tags.map(normalizeTag).filter(Boolean).slice(0, 12);
      const highlights = item.highlights.slice(0, 80);
      const folderId = item.folderId && ownedFolderIds.has(item.folderId) ? item.folderId : null;
      const contentHtml = await sanitizeStoredHtml(
        item.contentHtml,
        item.canonicalUrl || item.url,
      );
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
          contentHtml,
          heroImage: item.heroImage,
          published: item.published,
          savedAt: new Date(item.savedAt),
          archived: item.archived,
          favorited: item.favorited,
          note: item.note,
          folderId,
          tags,
          highlights,
        })
        .onConflictDoNothing({ target: articles.id });
    }

    await invalidateUserCache(context.userId);
    return loadSnapshot(context.userId);
  });
