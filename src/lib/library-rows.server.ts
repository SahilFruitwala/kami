import { and, asc, desc, eq } from "drizzle-orm";
import {
  MAX_CACHED_SNAPSHOT_BYTES,
  approxJsonBytes,
  CacheTTL,
  cacheKey,
  cached,
} from "@/lib/cache.server.ts";
import { getDb } from "@/lib/db";
import { articles, folders } from "@/lib/schema";
import {
  LIBRARY_LIMITS as L,
  normalizeTag,
  type Highlight,
  type LibraryItem,
} from "@/lib/library-item";
import { highlightSchema } from "@/lib/api/schemas/library";
import type { LibrarySnapshot } from "@/lib/api/types";

/** Shared server-side helpers for the library services: row <-> item
 *  mapping, ownership checks, snapshot load. Request schemas live in
 *  `@/lib/api/schemas/library`. */

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

export function rowToItem(row: ArticleListRow, opts?: { includeBody?: boolean }): LibraryItem {
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
    // when the reader opens a work (keeps bootstrap small; see loadLibraryPage).
    contentHtml: opts?.includeBody ? row.contentHtml || "" : "",
    heroImage: row.heroImage,
    published: row.published,
    savedAt: row.savedAt instanceof Date ? row.savedAt.getTime() : Date.now(),
    archived: Boolean(row.archived),
    tags: asStringArray(row.tags).map(normalizeTag).filter(Boolean).slice(0, L.tags),
    folderId: row.folderId,
    highlights: asHighlights(row.highlights),
    favorited: Boolean(row.favorited),
    note: row.note || "",
  };
}

/** Columns needed for library chrome / lists — intentionally excludes `contentHtml`. */
export const articleListColumns = {
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

/**
 * Sanitize article HTML before persistence. Extract/import paths already
 * sanitize, but `upsertLibraryItem` accepts client-supplied bodies — never
 * trust those for `dangerouslySetInnerHTML` later.
 */
export async function sanitizeStoredHtml(html: string, baseUrl: string): Promise<string> {
  if (!html.trim()) return "";
  const { sanitizeHtml } = await import("./sanitize-html.server.ts");
  try {
    return sanitizeHtml(html, baseUrl).slice(0, L.contentHtml);
  } catch {
    return "";
  }
}

/**
 * Resolve a client-supplied folder id to one owned by this user (or null).
 * Prevents cross-tenant folder linkage via crafted `folderId` values.
 */
export async function ownedFolderId(
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

export async function loadSnapshot(userId: string): Promise<LibrarySnapshot> {
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
