import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
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

type ArticleRow = {
  id: string;
  url: string;
  canonical_url: string;
  title: string;
  author: string;
  site_name: string;
  source: string;
  word_count: number;
  reading_minutes: number;
  excerpt: string;
  content_html: string;
  hero_image: string | null;
  published: string | null;
  saved_at: Date | string;
  archived: boolean;
  favorited: boolean;
  note: string;
  folder_id: string | null;
  tags: unknown;
  highlights: unknown;
};

type FolderRow = { id: string; name: string };

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

function savedAtMs(value: Date | string): number {
  if (value instanceof Date) return value.getTime();
  const ms = Date.parse(String(value));
  return Number.isFinite(ms) ? ms : Date.now();
}

function rowToItem(row: ArticleRow): LibraryItem {
  return {
    id: row.id,
    url: row.url,
    canonicalUrl: row.canonical_url,
    title: row.title,
    author: row.author || "",
    siteName: row.site_name || "",
    source: row.source === "x" ? "x" : "blog",
    wordCount: Number(row.word_count) || 0,
    readingMinutes: Number(row.reading_minutes) || 1,
    excerpt: row.excerpt || "",
    contentHtml: row.content_html || "",
    heroImage: row.hero_image,
    published: row.published,
    savedAt: savedAtMs(row.saved_at),
    archived: Boolean(row.archived),
    tags: asStringArray(row.tags).map(normalizeTag).filter(Boolean).slice(0, 12),
    folderId: row.folder_id,
    highlights: asHighlights(row.highlights),
    favorited: Boolean(row.favorited),
    note: row.note || "",
  };
}

export type LibrarySnapshot = {
  library: LibraryItem[];
  folders: Folder[];
};

export const getLibrary = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<LibrarySnapshot> => {
    const sql = await getSql();
    const folders = await sql<FolderRow>`
      select id, name from folders
      where user_id = ${context.userId}
      order by created_at asc
    `;
    const articles = await sql<ArticleRow>`
      select * from articles
      where user_id = ${context.userId}
      order by saved_at desc
    `;
    return {
      folders: folders.map((f) => ({ id: f.id, name: f.name })),
      library: articles.map(rowToItem),
    };
  });

export const upsertLibraryItem = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => libraryItemSchema.parse(input))
  .handler(async ({ context, data }): Promise<LibraryItem> => {
    const sql = await getSql();
    const tags = data.tags.map(normalizeTag).filter(Boolean).slice(0, 12);
    const highlights = data.highlights.slice(0, 80);
    const savedAt = new Date(data.savedAt);

    const existing = await sql<{ id: string }>`
      select id from articles
      where user_id = ${context.userId}
        and (id = ${data.id} or canonical_url = ${data.canonicalUrl} or url = ${data.url})
      limit 1
    `;

    if (existing[0]) {
      const id = existing[0].id;
      await sql`
        update articles set
          url = ${data.url},
          canonical_url = ${data.canonicalUrl},
          title = ${data.title},
          author = ${data.author},
          site_name = ${data.siteName},
          source = ${data.source},
          word_count = ${data.wordCount},
          reading_minutes = ${data.readingMinutes},
          excerpt = ${data.excerpt},
          content_html = ${data.contentHtml},
          hero_image = ${data.heroImage},
          published = ${data.published},
          archived = ${data.archived},
          favorited = ${data.favorited},
          note = ${data.note},
          folder_id = ${data.folderId},
          tags = ${JSON.stringify(tags)}::jsonb,
          highlights = ${JSON.stringify(highlights)}::jsonb
        where id = ${id} and user_id = ${context.userId}
      `;
      const rows = await sql<ArticleRow>`
        select * from articles where id = ${id} and user_id = ${context.userId} limit 1
      `;
      return rowToItem(rows[0]!);
    }

    await sql`
      insert into articles (
        id, user_id, url, canonical_url, title, author, site_name, source,
        word_count, reading_minutes, excerpt, content_html, hero_image, published,
        saved_at, archived, favorited, note, folder_id, tags, highlights
      ) values (
        ${data.id}, ${context.userId}, ${data.url}, ${data.canonicalUrl}, ${data.title},
        ${data.author}, ${data.siteName}, ${data.source}, ${data.wordCount},
        ${data.readingMinutes}, ${data.excerpt}, ${data.contentHtml}, ${data.heroImage},
        ${data.published}, ${savedAt.toISOString()}, ${data.archived}, ${data.favorited},
        ${data.note}, ${data.folderId}, ${JSON.stringify(tags)}::jsonb,
        ${JSON.stringify(highlights)}::jsonb
      )
    `;
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
    const sql = await getSql();
    const current = await sql<ArticleRow>`
      select * from articles where id = ${data.id} and user_id = ${context.userId} limit 1
    `;
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

    await sql`
      update articles set
        archived = ${next.archived},
        favorited = ${next.favorited},
        note = ${next.note},
        folder_id = ${next.folderId},
        tags = ${JSON.stringify(next.tags)}::jsonb,
        highlights = ${JSON.stringify(next.highlights)}::jsonb
      where id = ${data.id} and user_id = ${context.userId}
    `;
    return next;
  });

export const removeLibraryItem = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => z.object({ id: z.string().min(1) }).parse(input))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const sql = await getSql();
    await sql`
      delete from articles where id = ${data.id} and user_id = ${context.userId}
    `;
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
    const sql = await getSql();
    const name = data.name.trim().slice(0, 32);
    const existing = await sql<FolderRow>`
      select id, name from folders
      where user_id = ${context.userId} and lower(name) = lower(${name})
      limit 1
    `;
    if (existing[0]) return { id: existing[0].id, name: existing[0].name };

    const count = await sql<{ n: number }>`
      select count(*)::int as n from folders where user_id = ${context.userId}
    `;
    if ((count[0]?.n ?? 0) >= 24) {
      throw new Error("Folder limit reached.");
    }

    const id = data.id || uid();
    await sql`
      insert into folders (id, user_id, name) values (${id}, ${context.userId}, ${name})
      on conflict (id) do update set name = excluded.name
    `;
    return { id, name };
  });
export const renameLibraryFolder = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    z.object({ id: z.string().min(1), name: z.string().trim().min(1).max(32) }).parse(input),
  )
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const sql = await getSql();
    const name = data.name.trim().slice(0, 32);
    await sql`
      update folders set name = ${name}
      where id = ${data.id} and user_id = ${context.userId}
    `;
    return { ok: true };
  });

export const removeLibraryFolder = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => z.object({ id: z.string().min(1) }).parse(input))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const sql = await getSql();
    await sql`
      update articles set folder_id = null
      where user_id = ${context.userId} and folder_id = ${data.id}
    `;
    await sql`
      delete from folders where id = ${data.id} and user_id = ${context.userId}
    `;
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
    const sql = await getSql();
    const existing = await sql<{ n: number }>`
      select count(*)::int as n from articles where user_id = ${context.userId}
    `;
    // Only import local leftovers when the account library is empty.
    if ((existing[0]?.n ?? 0) > 0) {
      const folders = await sql<FolderRow>`
        select id, name from folders where user_id = ${context.userId} order by created_at asc
      `;
      const articles = await sql<ArticleRow>`
        select * from articles where user_id = ${context.userId} order by saved_at desc
      `;
      return {
        folders: folders.map((f) => ({ id: f.id, name: f.name })),
        library: articles.map(rowToItem),
      };
    }

    for (const folder of data.folders.slice(0, 24)) {
      await sql`
        insert into folders (id, user_id, name)
        values (${folder.id}, ${context.userId}, ${folder.name.trim().slice(0, 32)})
        on conflict (id) do nothing
      `;
    }

    for (const item of data.library.slice(0, 200)) {
      const tags = item.tags.map(normalizeTag).filter(Boolean).slice(0, 12);
      const highlights = item.highlights.slice(0, 80);
      await sql`
        insert into articles (
          id, user_id, url, canonical_url, title, author, site_name, source,
          word_count, reading_minutes, excerpt, content_html, hero_image, published,
          saved_at, archived, favorited, note, folder_id, tags, highlights
        ) values (
          ${item.id}, ${context.userId}, ${item.url}, ${item.canonicalUrl}, ${item.title},
          ${item.author}, ${item.siteName}, ${item.source}, ${item.wordCount},
          ${item.readingMinutes}, ${item.excerpt}, ${item.contentHtml}, ${item.heroImage},
          ${item.published}, ${new Date(item.savedAt).toISOString()}, ${item.archived},
          ${item.favorited}, ${item.note}, ${item.folderId}, ${JSON.stringify(tags)}::jsonb,
          ${JSON.stringify(highlights)}::jsonb
        )
        on conflict (id) do nothing
      `;
    }

    const folders = await sql<FolderRow>`
      select id, name from folders where user_id = ${context.userId} order by created_at asc
    `;
    const articles = await sql<ArticleRow>`
      select * from articles where user_id = ${context.userId} order by saved_at desc
    `;
    return {
      folders: folders.map((f) => ({ id: f.id, name: f.name })),
      library: articles.map(rowToItem),
    };
  });
