import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  MAX_CACHED_SNAPSHOT_BYTES,
  approxJsonBytes,
  CacheTTL,
  cacheKey,
  cached,
} from "@/lib/cache.server.ts";
import { getDb } from "@/lib/db";
import { articles, folders } from "@/lib/schema";
import type { Highlight, HighlightColorId, LibraryItem } from "@/lib/store";
import { HIGHLIGHT_COLORS, normalizeTag } from "@/lib/store";
import type { LibrarySnapshot } from "@/lib/library-fns.ts";

/** Shared server-side helpers for the library server functions: input
 *  schemas/clamps, row <-> item mapping, ownership checks, snapshot load. */

const highlightColorIds = HIGHLIGHT_COLORS.map((c) => c.id) as [
  HighlightColorId,
  ...HighlightColorId[],
];

export const highlightSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1).max(800),
  note: z.string().max(280).default(""),
  createdAt: z.number(),
  color: z.enum(highlightColorIds).default("vermilion"),
});

export const libraryItemSchema = z.object({
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
export function clampLibraryItemInput(input: unknown): unknown {
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
    tags: asStringArray(row.tags).map(normalizeTag).filter(Boolean).slice(0, 12),
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
    return sanitizeHtml(html, baseUrl).slice(0, 1_500_000);
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
