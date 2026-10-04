import { and, count, desc, eq, ilike, or } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import {
  CacheTTL,
  cacheKey,
  cached,
  hashKeyPart,
  normalizeCacheQuery,
} from "@/lib/cache.server.ts";
import { getDb } from "@/lib/db";
import {
  bookGenres,
  books,
  genres,
  lists,
  movieGenres,
  movies,
  places,
  restaurants,
  tvShowGenres,
  tvShows,
  watchedEpisodes,
  wishlistItems,
} from "@/lib/schema";

import { type ShelfCard, type ShelfDetail, type ShelfTab } from "@/lib/shelves.ts";
import { shelfStatus, shelfType } from "@/lib/shelves-db.server.ts";

function toMs(v: Date | null): number | null {
  return v ? v.getTime() : null;
}

export const getShelfCounts = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<Record<ShelfTab, number>> => {
    // Four COUNT queries on every shelves render — a 60s per-user entry
    // absorbs remount bursts; writes invalidate it below.
    return cached(
      cacheKey("u", context.userId, "shelves", "counts"),
      CacheTTL.shelfReads,
      async () => {
        const db = await getDb();
        const [[m], [t], [b], [w]] = await Promise.all([
          db
            .select({ value: count() })
            .from(movies)
            .innerJoin(lists, eq(movies.listId, lists.id))
            .where(eq(lists.ownerId, context.userId)),
          db
            .select({ value: count() })
            .from(tvShows)
            .innerJoin(lists, eq(tvShows.listId, lists.id))
            .where(eq(lists.ownerId, context.userId)),
          db
            .select({ value: count() })
            .from(books)
            .innerJoin(lists, eq(books.listId, lists.id))
            .where(eq(lists.ownerId, context.userId)),
          db
            .select({ value: count() })
            .from(wishlistItems)
            .innerJoin(lists, eq(wishlistItems.listId, lists.id))
            .where(eq(lists.ownerId, context.userId)),
        ]);
        return {
          movie: Number(m?.value ?? 0),
          tv: Number(t?.value ?? 0),
          book: Number(b?.value ?? 0),
          wishlist: Number(w?.value ?? 0),
        };
      },
    );
  });

export const listShelfItems = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    z
      .object({
        type: shelfType,
        status: shelfStatus.optional(),
        query: z.string().max(200).default(""),
        limit: z.number().int().min(1).max(200).default(60),
        offset: z.number().int().min(0).default(0),
      })
      .parse(input),
  )
  .handler(async ({ context, data }): Promise<ShelfCard[]> => {
    const q = data.query.trim();
    // Filtered shelf lists are re-queried on every tab switch / keystroke.
    // Cache per user + filter for 60s; shelf writes invalidate the prefix.
    return cached(
      cacheKey(
        "u",
        context.userId,
        "shelves",
        "list",
        data.type,
        data.status ?? "all",
        hashKeyPart(`${normalizeCacheQuery(q)}:${data.limit}:${data.offset}`),
      ),
      CacheTTL.shelfReads,
      async (): Promise<ShelfCard[]> => {
        const db = await getDb();
        const owner = eq(lists.ownerId, context.userId);

        if (data.type === "movie") {
          const conds = [
            owner,
            data.status ? eq(movies.status, data.status) : undefined,
            q ? ilike(movies.title, `%${q}%`) : undefined,
          ].filter(Boolean);
          const rows = await db
            .select()
            .from(movies)
            .innerJoin(lists, eq(movies.listId, lists.id))
            .where(and(...conds))
            .orderBy(desc(movies.createdAt))
            .limit(data.limit)
            .offset(data.offset);
          return rows.map(({ movies: r }) => ({
            id: r.id,
            type: "movie" as const,
            title: r.title,
            imageUrl: r.imageUrl,
            status: r.status,
            subtitle: r.releaseYear ? String(r.releaseYear) : null,
            overview: r.overview,
            year: r.releaseYear,
            createdAt: r.createdAt ? r.createdAt.getTime() : Date.now(),
            completedAt: toMs(r.completedAt),
            episodesWatched: null,
            totalEpisodes: null,
            lastEpisode: null,
            progressPercent: null,
          }));
        }

        if (data.type === "tv") {
          const conds = [
            owner,
            data.status ? eq(tvShows.status, data.status) : undefined,
            q ? ilike(tvShows.title, `%${q}%`) : undefined,
          ].filter(Boolean);
          const rows = await db
            .select()
            .from(tvShows)
            .innerJoin(lists, eq(tvShows.listId, lists.id))
            .where(and(...conds))
            .orderBy(desc(tvShows.createdAt))
            .limit(data.limit)
            .offset(data.offset);
          return rows.map(({ tv_shows: r }) => ({
            id: r.id,
            type: "tv" as const,
            title: r.title,
            imageUrl: r.imageUrl,
            status: r.status,
            subtitle:
              r.episodesWatched != null && r.totalEpisodes != null
                ? `${r.episodesWatched}/${r.totalEpisodes} eps${r.lastEpisode ? ` · ${r.lastEpisode}` : ""}`
                : r.releaseYear
                  ? String(r.releaseYear)
                  : null,
            overview: r.overview,
            year: r.releaseYear,
            createdAt: r.createdAt ? r.createdAt.getTime() : Date.now(),
            completedAt: toMs(r.completedAt),
            episodesWatched: r.episodesWatched,
            totalEpisodes: r.totalEpisodes,
            lastEpisode: r.lastEpisode,
            progressPercent: null,
          }));
        }

        if (data.type === "book") {
          const conds = [
            owner,
            data.status ? eq(books.status, data.status) : undefined,
            q ? or(ilike(books.title, `%${q}%`), ilike(books.author, `%${q}%`)) : undefined,
          ].filter(Boolean);
          const rows = await db
            .select()
            .from(books)
            .innerJoin(lists, eq(books.listId, lists.id))
            .where(and(...conds))
            .orderBy(desc(books.createdAt))
            .limit(data.limit)
            .offset(data.offset);
          return rows.map(({ books: r }) => ({
            id: r.id,
            type: "book" as const,
            title: r.title,
            imageUrl: r.imageUrl,
            status: r.status,
            subtitle: r.author ?? null,
            overview: r.overview,
            year: r.publishYear,
            createdAt: r.createdAt ? r.createdAt.getTime() : Date.now(),
            completedAt: toMs(r.completedAt),
            episodesWatched: null,
            totalEpisodes: null,
            lastEpisode: null,
            progressPercent: r.progressPercent,
          }));
        }

        if (data.type === "wishlist") {
          const conds = [
            owner,
            data.status ? eq(wishlistItems.status, data.status) : undefined,
            q ? ilike(wishlistItems.title, `%${q}%`) : undefined,
          ].filter(Boolean);
          const rows = await db
            .select()
            .from(wishlistItems)
            .innerJoin(lists, eq(wishlistItems.listId, lists.id))
            .where(and(...conds))
            .orderBy(desc(wishlistItems.createdAt))
            .limit(data.limit)
            .offset(data.offset);
          return rows.map(({ wishlist_items: r }) => ({
            id: r.id,
            type: "wishlist" as const,
            title: r.title,
            imageUrl: r.imageUrl,
            status: r.status,
            subtitle: r.price ?? r.source ?? null,
            overview: r.description,
            year: null,
            createdAt: r.createdAt ? r.createdAt.getTime() : Date.now(),
            completedAt: toMs(r.completedAt),
            episodesWatched: null,
            totalEpisodes: null,
            lastEpisode: null,
            progressPercent: null,
          }));
        }

        if (data.type === "restaurant") {
          const conds = [
            owner,
            data.status ? eq(restaurants.status, data.status) : undefined,
            q ? ilike(restaurants.title, `%${q}%`) : undefined,
          ].filter(Boolean);
          const rows = await db
            .select()
            .from(restaurants)
            .innerJoin(lists, eq(restaurants.listId, lists.id))
            .where(and(...conds))
            .orderBy(desc(restaurants.createdAt))
            .limit(data.limit)
            .offset(data.offset);
          return rows.map(({ restaurants: r }) => ({
            id: r.id,
            type: "restaurant" as const,
            title: r.title,
            imageUrl: r.imageUrl,
            status: r.status,
            subtitle: r.cuisine ?? r.address ?? null,
            overview: null,
            year: null,
            createdAt: r.createdAt ? r.createdAt.getTime() : Date.now(),
            completedAt: toMs(r.completedAt),
            episodesWatched: null,
            totalEpisodes: null,
            lastEpisode: null,
            progressPercent: null,
          }));
        }

        const conds = [
          owner,
          data.status ? eq(places.status, data.status) : undefined,
          q ? ilike(places.title, `%${q}%`) : undefined,
        ].filter(Boolean);
        const rows = await db
          .select()
          .from(places)
          .innerJoin(lists, eq(places.listId, lists.id))
          .where(and(...conds))
          .orderBy(desc(places.createdAt))
          .limit(data.limit)
          .offset(data.offset);
        return rows.map(({ places: r }) => ({
          id: r.id,
          type: "place" as const,
          title: r.title,
          imageUrl: r.imageUrl,
          status: r.status,
          subtitle: r.address ?? null,
          overview: null,
          year: null,
          createdAt: r.createdAt ? r.createdAt.getTime() : Date.now(),
          completedAt: toMs(r.completedAt),
          episodesWatched: null,
          totalEpisodes: null,
          lastEpisode: null,
          progressPercent: null,
        }));
      },
    );
  });

/** Folio detail for one shelf item — owner-scoped, null when not yours. */
export const getShelfItem = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    z.object({ type: shelfType, id: z.string().min(1).max(200) }).parse(input),
  )
  .handler(async ({ context, data }): Promise<ShelfDetail | null> => {
    // Detail opens repeat the same 2-3 queries; cache per user + item.
    // Episode ticks and status changes invalidate the user prefix.
    return cached(
      cacheKey("u", context.userId, "shelves", "detail", data.type, data.id),
      CacheTTL.shelfReads,
      async (): Promise<ShelfDetail | null> => {
        const db = await getDb();
        const owner = eq(lists.ownerId, context.userId);

        if (data.type === "movie") {
          const rows = await db
            .select()
            .from(movies)
            .innerJoin(lists, eq(movies.listId, lists.id))
            .where(and(owner, eq(movies.id, data.id)))
            .limit(1);
          if (!rows[0]) return null;
          const g = await db
            .select({ name: genres.name })
            .from(movieGenres)
            .innerJoin(genres, eq(movieGenres.genreId, genres.id))
            .where(eq(movieGenres.movieId, data.id));
          return { type: "movie", item: rows[0].movies, genres: g.map((r) => r.name) };
        }
        if (data.type === "tv") {
          const rows = await db
            .select()
            .from(tvShows)
            .innerJoin(lists, eq(tvShows.listId, lists.id))
            .where(and(owner, eq(tvShows.id, data.id)))
            .limit(1);
          if (!rows[0]) return null;
          const g = await db
            .select({ name: genres.name })
            .from(tvShowGenres)
            .innerJoin(genres, eq(tvShowGenres.genreId, genres.id))
            .where(eq(tvShowGenres.tvShowId, data.id));
          const [{ value: ticked }] = await db
            .select({ value: count() })
            .from(watchedEpisodes)
            .where(eq(watchedEpisodes.itemId, data.id));
          return {
            type: "tv",
            item: rows[0].tv_shows,
            genres: g.map((r) => r.name),
            episodesTicked: Number(ticked ?? 0),
          };
        }
        if (data.type === "book") {
          const rows = await db
            .select()
            .from(books)
            .innerJoin(lists, eq(books.listId, lists.id))
            .where(and(owner, eq(books.id, data.id)))
            .limit(1);
          if (!rows[0]) return null;
          const g = await db
            .select({ name: genres.name })
            .from(bookGenres)
            .innerJoin(genres, eq(bookGenres.genreId, genres.id))
            .where(eq(bookGenres.bookId, data.id));
          return { type: "book", item: rows[0].books, genres: g.map((r) => r.name) };
        }
        const rows = await db
          .select()
          .from(wishlistItems)
          .innerJoin(lists, eq(wishlistItems.listId, lists.id))
          .where(and(owner, eq(wishlistItems.id, data.id)))
          .limit(1);
        if (!rows[0]) return null;
        return { type: "wishlist", item: rows[0].wishlist_items };
      },
      { skipCache: (detail) => detail === null },
    );
  });

// ---------- Add (port of shelf/src/server/items.ts:addItem) ----------
