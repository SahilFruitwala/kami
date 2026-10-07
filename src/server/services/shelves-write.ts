import "@tanstack/react-start/server-only";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { ShelfDuplicate } from "@/lib/api/types";
import { invalidateUserCache } from "@/lib/cache.server.ts";
import { getDb } from "@/lib/db";
import { activity, books, movies, places, restaurants, tvShows, wishlistItems } from "@/lib/schema";
import {
  clampShelfItemInput,
  addShelfItemInput,
  findExistingMovieOrTv,
  findOwnedItem,
  getOrCreateDefaultList,
  isUniqueViolation,
  normalizeTitle,
  optionalInteger,
  safeHttpUrl,
  shelfStatus,
  shelfType,
  syncGenres,
  tableForType,
} from "@/lib/shelves-db.server.ts";
import { badRequest, conflict, notFound } from "@/server/http";

/** `POST /api/shelves/:type` body — the type lives in the path. */
export const addShelfItemBody = z.preprocess(
  clampShelfItemInput,
  addShelfItemInput.omit({ type: true }),
);

/** `GET /api/shelves/:type/duplicates?title=&tmdbId=` */
export const duplicatesQuery = z.object({
  title: z.string().max(300),
  tmdbId: z.string().max(32).optional(),
});

export const statusBody = z.object({ status: shelfStatus });

export const bookIdParams = z.object({ id: z.string().min(1).max(200) });

export const bookProgressBody = z
  .union([
    z.object({
      mode: z.literal("pages"),
      currentPage: z.number().int().min(0).max(100_000),
      pageCount: z.number().int().min(1).max(100_000),
    }),
    z.object({
      mode: z.literal("percent"),
      percent: z.number().int().min(0).max(100),
    }),
  ])
  .refine((d) => d.mode !== "pages" || d.currentPage <= d.pageCount, {
    message: "Current page can't be past the last page.",
  });

type ShelfType = z.output<typeof shelfType>;

/**
 * Add a movie / TV show / book / wishlist item to the user's default shelf for
 * its type. Accepts the `metadata` produced by the lookup providers
 * (`year`, `overview`, `genre`, `author`, `tmdbId`, `description`, `source`,
 * …) and fans it out into the typed columns + genre junctions, mirroring
 * shelf's `insertConcreteItem`.
 *
 * Movies and TV shows are unique per list by TMDB id (when present) or
 * normalized title — duplicates are rejected instead of inserted again.
 */
export async function addShelfItem(
  userId: string,
  data: z.output<typeof addShelfItemInput>,
): Promise<{ id: string; listId: string; type: ShelfType; status: z.output<typeof shelfStatus> }> {
  const db = await getDb();
  const title = data.title.trim();
  if (!title) throw badRequest("Title is required");
  const metadata = data.metadata ?? {};
  const status = data.status;
  const listId = await getOrCreateDefaultList(userId, data.type);
  const id = crypto.randomUUID();
  const completedAt = status === "done" ? new Date() : null;
  const link = safeHttpUrl(data.link) ?? null;
  const imageUrl = safeHttpUrl(data.imageUrl) ?? null;
  const notes = data.notes?.trim() ? data.notes.trim() : null;
  const normalizedTitle = normalizeTitle(title);
  const tmdbId = optionalInteger(metadata.tmdbId);
  const extraMetadata = Object.fromEntries(
    Object.entries(metadata).filter(([, v]) => v.trim() !== ""),
  );

  if (data.type === "movie" || data.type === "tv") {
    const existing = await findExistingMovieOrTv(db, data.type, listId, {
      tmdbId,
      normalizedTitle,
    });
    if (existing) {
      throw conflict("Already on your shelf");
    }
  }

  // Item row, genre links and the activity entry commit together.
  try {
    await db.transaction(async (tx) => {
      if (data.type === "movie") {
        await tx.insert(movies).values({
          id,
          listId,
          title,
          normalizedTitle,
          notes,
          link,
          imageUrl,
          status,
          extraMetadata,
          addedBy: userId,
          completedAt,
          releaseYear: optionalInteger(metadata.year),
          overview: metadata.overview ?? null,
          tmdbId,
        });
      } else if (data.type === "tv") {
        await tx.insert(tvShows).values({
          id,
          listId,
          title,
          normalizedTitle,
          notes,
          link,
          imageUrl,
          status,
          extraMetadata,
          addedBy: userId,
          completedAt,
          releaseYear: optionalInteger(metadata.year),
          overview: metadata.overview ?? null,
          tmdbId,
          episodesWatched: 0,
        });
      } else if (data.type === "book") {
        await tx.insert(books).values({
          id,
          listId,
          title,
          normalizedTitle,
          notes,
          link,
          imageUrl,
          status,
          extraMetadata,
          addedBy: userId,
          completedAt,
          author: metadata.author ?? null,
          publishYear: optionalInteger(metadata.year),
          overview: metadata.overview ?? null,
          pageCount: positiveInteger(metadata.pages),
          progressPercent: status === "done" ? 100 : 0,
        });
      } else if (data.type === "restaurant") {
        await tx.insert(restaurants).values({
          id,
          listId,
          title,
          normalizedTitle,
          notes,
          link,
          imageUrl,
          status,
          extraMetadata,
          addedBy: userId,
          completedAt,
          address: metadata.address ?? null,
          rating: metadata.rating ?? null,
          price: metadata.price ?? null,
          kind: metadata.kind ?? null,
        });
      } else if (data.type === "place") {
        await tx.insert(places).values({
          id,
          listId,
          title,
          normalizedTitle,
          notes,
          link,
          imageUrl,
          status,
          extraMetadata,
          addedBy: userId,
          completedAt,
          address: metadata.address ?? null,
          rating: metadata.rating ?? null,
          price: metadata.price ?? null,
          kind: metadata.kind ?? null,
        });
      } else {
        await tx.insert(wishlistItems).values({
          id,
          listId,
          title,
          normalizedTitle,
          notes,
          link,
          imageUrl,
          status,
          extraMetadata,
          addedBy: userId,
          completedAt,
          price: metadata.price ?? null,
          description: metadata.description ?? null,
          source: metadata.source ?? null,
        });
      }

      await syncGenres(tx, data.type, id, metadata.genre);
      await tx.insert(activity).values({
        id: crypto.randomUUID(),
        listId,
        userId: userId,
        action: status === "done" ? "completed" : "added",
        itemTitle: title,
        itemType: data.type,
      });
    });
  } catch (err) {
    // Race: unique indexes on movies/tv may reject a concurrent insert.
    if ((data.type === "movie" || data.type === "tv") && isUniqueViolation(err)) {
      throw conflict("Already on your shelf");
    }
    throw err;
  }

  await invalidateUserCache(userId);
  return { id, listId, type: data.type, status };
}

/** Title / TMDB matches already on this shelf — for duplicate warnings at add-time. */
export async function findShelfDuplicates(
  userId: string,
  data: z.output<typeof duplicatesQuery> & { type: ShelfType },
): Promise<ShelfDuplicate[]> {
  const title = data.title.trim();
  if (!title) return [];
  const db = await getDb();
  const listId = await getOrCreateDefaultList(userId, data.type);
  const normalized = normalizeTitle(title);
  const tmdbId = optionalInteger(data.tmdbId);

  if (data.type === "movie" || data.type === "tv") {
    const found = await findExistingMovieOrTv(db, data.type, listId, {
      tmdbId,
      normalizedTitle: normalized,
    });
    return found ? [found] : [];
  }
  if (data.type === "book")
    return db
      .select({ id: books.id, title: books.title, status: books.status })
      .from(books)
      .where(and(eq(books.listId, listId), eq(books.normalizedTitle, normalized)))
      .limit(5);
  return db
    .select({ id: wishlistItems.id, title: wishlistItems.title, status: wishlistItems.status })
    .from(wishlistItems)
    .where(and(eq(wishlistItems.listId, listId), eq(wishlistItems.normalizedTitle, normalized)))
    .limit(5);
}

/** Flip to_try ↔ done ↔ abandoned on any shelf type. */
export async function setShelfItemStatus(
  userId: string,
  data: { type: ShelfType; id: string; status: z.output<typeof shelfStatus> },
) {
  const item = await findOwnedItem(userId, data.type, data.id);
  if (!item) throw notFound("Item not found");

  const db = await getDb();
  const table = tableForType(data.type);
  await db
    .update(table)
    .set({
      status: data.status,
      completedAt: data.status === "done" ? new Date() : null,
    })
    .where(eq(table.id, data.id));

  // Keep book progress in step with the ends of the scale: read = 100%,
  // back to "to read" = start over. Reading/abandoned keep their place.
  if (data.type === "book" && (data.status === "done" || data.status === "to_try")) {
    const finished = data.status === "done";
    await db
      .update(books)
      .set({
        progressPercent: finished ? 100 : 0,
        currentPage: finished ? sql`${books.pageCount}` : null,
      })
      .where(eq(books.id, data.id));
  }

  // Starting a book/series is not worth an activity entry.
  if (item.status !== data.status && data.status !== "in_progress") {
    const action =
      data.status === "done" ? "completed" : data.status === "abandoned" ? "abandoned" : "reverted";
    await db.insert(activity).values({
      id: crypto.randomUUID(),
      listId: item.listId,
      userId: userId,
      action,
      itemTitle: item.title,
      itemType: data.type,
    });
  }

  await invalidateUserCache(userId);
  return { id: data.id, type: data.type, status: data.status };
}

/** Remove a shelf item (watched episodes cascade for TV). */
export async function deleteShelfItem(userId: string, data: { type: ShelfType; id: string }) {
  const item = await findOwnedItem(userId, data.type, data.id);
  if (!item) return { deleted: false };

  const db = await getDb();
  const table = tableForType(data.type);
  await db.transaction(async (tx) => {
    await tx.delete(table).where(eq(table.id, data.id));
    await tx.insert(activity).values({
      id: crypto.randomUUID(),
      listId: item.listId,
      userId: userId,
      action: "removed",
      itemTitle: item.title,
      itemType: data.type,
    });
  });
  await invalidateUserCache(userId);
  return { deleted: true };
}

function positiveInteger(value: string | undefined): number | null {
  const n = optionalInteger(value);
  return n != null && n > 0 ? n : null;
}

/**
 * Set how far through a book the reader is — by page (`currentPage` of
 * `pageCount`) or by `percent`. Status follows: 0 → to read, 1–99 → reading,
 * 100 → read. Page counts are remembered even when tracking by percent.
 */
export async function setBookProgress(
  userId: string,
  id: string,
  progress: z.output<typeof bookProgressBody>,
) {
  const data = { id, ...progress };
  const item = await findOwnedItem(userId, "book", data.id);
  if (!item) throw notFound("Item not found");

  const percent =
    data.mode === "pages"
      ? Math.min(100, Math.round((data.currentPage / data.pageCount) * 100))
      : data.percent;
  // A book only counts as read on the last page, not at a rounded 100%.
  const finished = data.mode === "pages" ? data.currentPage >= data.pageCount : percent >= 100;
  const status = finished ? "done" : percent > 0 ? "in_progress" : "to_try";

  const db = await getDb();
  const [prev] = await db
    .select({ completedAt: books.completedAt })
    .from(books)
    .where(eq(books.id, data.id))
    .limit(1);

  await db
    .update(books)
    .set({
      progressPercent: finished ? 100 : Math.min(percent, 99),
      ...(data.mode === "pages"
        ? { currentPage: data.currentPage, pageCount: data.pageCount }
        : { currentPage: null }),
      status,
      completedAt: finished ? (prev?.completedAt ?? new Date()) : null,
    })
    .where(eq(books.id, data.id));

  if (item.status !== status && status !== "in_progress") {
    await db.insert(activity).values({
      id: crypto.randomUUID(),
      listId: item.listId,
      userId: userId,
      action: status === "done" ? "completed" : "reverted",
      itemTitle: item.title,
      itemType: "book",
    });
  }

  await invalidateUserCache(userId);
  return { status, percent: finished ? 100 : Math.min(percent, 99) };
}

/** `POST /api/shelves/book/import` — rows parsed client-side from a Goodreads or StoryGraph export. */
export const importBooksBody = z.object({
  source: z.enum(["goodreads", "storygraph"]).default("goodreads"),
  books: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(500),
        author: z.string().trim().max(300).optional(),
        isbn: z
          .string()
          .regex(/^(\d{9}[\dX]|\d{13})$/)
          .optional(),
        year: z.number().int().min(1).max(3000).optional(),
        pages: z.number().int().min(1).max(100_000).optional(),
        status: shelfStatus,
        // Goodreads rates in whole stars, StoryGraph in quarter stars.
        rating: z.number().min(0.25).max(5).multipleOf(0.25).optional(),
        goodreadsId: z
          .string()
          .regex(/^\d{1,20}$/)
          .optional(),
        dateAdded: z.iso.date().optional(),
        dateRead: z.iso.date().optional(),
        review: z.string().max(20_000).optional(),
      }),
    )
    .max(10_000),
});

const IMPORT_CHUNK = 500;
const SOURCE_NAMES = { goodreads: "Goodreads", storygraph: "StoryGraph" } as const;

/**
 * Bulk-add books from a Goodreads or StoryGraph export to the user's default book shelf.
 * Skips books already there (same normalized title and author) and repeats
 * inside the file, so re-importing the same export is a no-op.
 */
export async function importBooks(
  userId: string,
  data: z.output<typeof importBooksBody>,
): Promise<{ imported: number; skipped: number }> {
  const db = await getDb();
  const listId = await getOrCreateDefaultList(userId, "book");
  const key = (title: string, author: string | null | undefined) =>
    `${normalizeTitle(title)}\u0000${normalizeTitle(author ?? "")}`;

  const existing = await db
    .select({ title: books.title, author: books.author })
    .from(books)
    .where(eq(books.listId, listId));
  const seen = new Set(existing.map((b) => key(b.title, b.author)));

  const rows: (typeof books.$inferInsert)[] = [];
  for (const b of data.books) {
    const k = key(b.title, b.author);
    if (seen.has(k)) continue;
    seen.add(k);
    const done = b.status === "done";
    const added = b.dateAdded ? new Date(b.dateAdded) : new Date();
    const extraMetadata: Record<string, string> = { source: data.source };
    if (b.isbn) extraMetadata.isbn = b.isbn;
    if (b.rating) extraMetadata.rating = String(b.rating);
    if (b.goodreadsId) extraMetadata.goodreadsId = b.goodreadsId;
    rows.push({
      id: crypto.randomUUID(),
      listId,
      title: b.title,
      normalizedTitle: normalizeTitle(b.title),
      notes: b.review ?? null,
      link: b.goodreadsId ? `https://www.goodreads.com/book/show/${b.goodreadsId}` : null,
      imageUrl: b.isbn ? `https://covers.openlibrary.org/b/isbn/${b.isbn}-M.jpg` : null,
      status: b.status,
      extraMetadata,
      addedBy: userId,
      createdAt: added,
      completedAt: done ? (b.dateRead ? new Date(b.dateRead) : added) : null,
      author: b.author ?? null,
      publishYear: b.year ?? null,
      pageCount: b.pages ?? null,
      currentPage: done && b.pages ? b.pages : null,
      progressPercent: done ? 100 : 0,
    });
  }

  if (rows.length > 0) {
    await db.transaction(async (tx) => {
      for (let i = 0; i < rows.length; i += IMPORT_CHUNK) {
        await tx.insert(books).values(rows.slice(i, i + IMPORT_CHUNK));
      }
      // One activity entry for the batch rather than one per book.
      await tx.insert(activity).values({
        id: crypto.randomUUID(),
        listId,
        userId,
        action: "added",
        itemTitle: `${rows.length} ${rows.length === 1 ? "book" : "books"} from ${SOURCE_NAMES[data.source]}`,
        itemType: "book",
      });
    });
    await invalidateUserCache(userId);
  }

  return { imported: rows.length, skipped: data.books.length - rows.length };
}
