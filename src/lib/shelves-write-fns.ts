import { and, eq } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
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
export const addShelfItem = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => addShelfItemInput.parse(clampShelfItemInput(input)))
  .handler(async ({ context, data }) => {
    const db = await getDb();
    const title = data.title.trim();
    if (!title) throw new Error("Title is required");
    const metadata = data.metadata ?? {};
    const status = data.status;
    const listId = await getOrCreateDefaultList(context.userId, data.type);
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
        throw new Error("Already on your shelf");
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
            addedBy: context.userId,
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
            addedBy: context.userId,
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
            addedBy: context.userId,
            completedAt,
            author: metadata.author ?? null,
            publishYear: optionalInteger(metadata.year),
            overview: metadata.overview ?? null,
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
            addedBy: context.userId,
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
            addedBy: context.userId,
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
            addedBy: context.userId,
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
          userId: context.userId,
          action: status === "done" ? "completed" : "added",
          itemTitle: title,
          itemType: data.type,
        });
      });
    } catch (err) {
      // Race: unique indexes on movies/tv may reject a concurrent insert.
      if ((data.type === "movie" || data.type === "tv") && isUniqueViolation(err)) {
        throw new Error("Already on your shelf");
      }
      throw err;
    }

    await invalidateUserCache(context.userId);
    return { id, listId, type: data.type, status };
  });

/** Title / TMDB matches already on this shelf — for duplicate warnings at add-time. */
export const findShelfDuplicates = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    z
      .object({
        type: shelfType,
        title: z.string().max(300),
        tmdbId: z.string().max(32).optional(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const title = data.title.trim();
    if (!title) return [];
    const db = await getDb();
    const listId = await getOrCreateDefaultList(context.userId, data.type);
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
  });

/** Flip to_try ↔ done ↔ abandoned on any shelf type. */
export const setShelfItemStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    z
      .object({
        type: shelfType,
        id: z.string().min(1).max(200),
        status: shelfStatus,
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const item = await findOwnedItem(context.userId, data.type, data.id);
    if (!item) throw new Error("Item not found");

    const db = await getDb();
    const table = tableForType(data.type);
    await db
      .update(table)
      .set({
        status: data.status,
        completedAt: data.status === "done" ? new Date() : null,
      })
      .where(eq(table.id, data.id));

    if (item.status !== data.status) {
      const action =
        data.status === "done"
          ? "completed"
          : data.status === "abandoned"
            ? "abandoned"
            : "reverted";
      await db.insert(activity).values({
        id: crypto.randomUUID(),
        listId: item.listId,
        userId: context.userId,
        action,
        itemTitle: item.title,
        itemType: data.type,
      });
    }

    await invalidateUserCache(context.userId);
    return { id: data.id, type: data.type, status: data.status };
  });

/** Remove a shelf item (watched episodes cascade for TV). */
export const deleteShelfItem = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    z.object({ type: shelfType, id: z.string().min(1).max(200) }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const item = await findOwnedItem(context.userId, data.type, data.id);
    if (!item) return { deleted: false };

    const db = await getDb();
    const table = tableForType(data.type);
    await db.transaction(async (tx) => {
      await tx.delete(table).where(eq(table.id, data.id));
      await tx.insert(activity).values({
        id: crypto.randomUUID(),
        listId: item.listId,
        userId: context.userId,
        action: "removed",
        itemTitle: item.title,
        itemType: data.type,
      });
    });
    await invalidateUserCache(context.userId);
    return { deleted: true };
  });
