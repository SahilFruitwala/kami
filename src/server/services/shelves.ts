import "@tanstack/react-start/server-only";
import { and, count, desc, eq, ilike, or } from "drizzle-orm";
import { z } from "zod";
import type { JsonRow } from "@/lib/api/types";
import {
  CacheTTL,
  cacheKey,
  cached,
  hashKeyPart,
  normalizeCacheQuery,
} from "@/lib/cache.server.ts";
import { getDb } from "@/lib/db.server";
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
import { shelfStatus, shelfType, tableForType } from "@/lib/shelves-db.server.ts";
import { notFound } from "@/server/http";

export const shelfTypeParams = z.object({ type: shelfType });
export const shelfItemParams = z.object({ type: shelfType, id: z.string().min(1).max(200) });

/** `GET /api/shelves/:type?status=&q=&limit=&offset=` */
export const shelfListQuery = z.object({
  status: shelfStatus.optional(),
  q: z.string().max(200).default(""),
  limit: z.coerce.number().int().min(1).max(200).default(60),
  offset: z.coerce.number().int().min(0).default(0),
});

type ShelfListArgs = z.output<typeof shelfListQuery> & { type: z.output<typeof shelfType> };

function toMs(v: Date | null): number | null {
  return v ? v.getTime() : null;
}

/** Dates → ISO strings up front, so fresh reads match cached (JSON) ones. */
function jsonRow<T extends Record<string, unknown>>(row: T): JsonRow<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) out[k] = v instanceof Date ? v.toISOString() : v;
  return out as JsonRow<T>;
}

export async function getShelfCounts(userId: string): Promise<Record<ShelfTab, number>> {
  // Four COUNT queries on every shelves render — a 60s per-user entry
  // absorbs remount bursts; writes invalidate it below.
  return cached(cacheKey("u", userId, "shelves", "counts"), CacheTTL.shelfReads, async () => {
    const db = await getDb();
    const [[m], [t], [b], [w]] = await Promise.all([
      db
        .select({ value: count() })
        .from(movies)
        .innerJoin(lists, eq(movies.listId, lists.id))
        .where(eq(lists.ownerId, userId)),
      db
        .select({ value: count() })
        .from(tvShows)
        .innerJoin(lists, eq(tvShows.listId, lists.id))
        .where(eq(lists.ownerId, userId)),
      db
        .select({ value: count() })
        .from(books)
        .innerJoin(lists, eq(books.listId, lists.id))
        .where(eq(lists.ownerId, userId)),
      db
        .select({ value: count() })
        .from(wishlistItems)
        .innerJoin(lists, eq(wishlistItems.listId, lists.id))
        .where(eq(lists.ownerId, userId)),
    ]);
    return {
      movie: Number(m?.value ?? 0),
      tv: Number(t?.value ?? 0),
      book: Number(b?.value ?? 0),
      wishlist: Number(w?.value ?? 0),
    };
  });
}

type ShelfRow = {
  movie: typeof movies.$inferSelect;
  tv: typeof tvShows.$inferSelect;
  book: typeof books.$inferSelect;
  wishlist: typeof wishlistItems.$inferSelect;
  restaurant: typeof restaurants.$inferSelect;
  place: typeof places.$inferSelect;
};
type ShelfKind = keyof ShelfRow;
type CardExtras = Partial<Omit<ShelfCard, "id" | "type" | "title" | "imageUrl" | "status">>;

/**
 * What each shelf type adds to the shared card columns (id, title, image,
 * status, dates). Adding a shelf type means one entry here, not another
 * copy of the list query.
 */
const CARD_EXTRAS: { [K in ShelfKind]: (row: ShelfRow[K]) => CardExtras } = {
  movie: (r) => ({
    subtitle: r.releaseYear ? String(r.releaseYear) : null,
    overview: r.overview,
    year: r.releaseYear,
  }),
  tv: (r) => ({
    subtitle:
      r.episodesWatched != null && r.totalEpisodes != null
        ? `${r.episodesWatched}/${r.totalEpisodes} eps${r.lastEpisode ? ` · ${r.lastEpisode}` : ""}`
        : r.releaseYear
          ? String(r.releaseYear)
          : null,
    overview: r.overview,
    year: r.releaseYear,
    episodesWatched: r.episodesWatched,
    totalEpisodes: r.totalEpisodes,
    lastEpisode: r.lastEpisode,
  }),
  book: (r) => ({
    subtitle: r.author ?? null,
    overview: r.overview,
    year: r.publishYear,
    progressPercent: r.progressPercent,
  }),
  wishlist: (r) => ({
    subtitle: r.price ?? r.source ?? null,
    overview: r.description,
    link: r.link,
  }),
  restaurant: (r) => ({ subtitle: r.cuisine ?? r.address ?? null }),
  place: (r) => ({ subtitle: r.address ?? null }),
};

function toCard<K extends ShelfKind>(type: K, row: ShelfRow[ShelfKind]): ShelfCard {
  return {
    id: row.id,
    type,
    title: row.title,
    imageUrl: row.imageUrl,
    status: row.status,
    subtitle: null,
    overview: null,
    year: null,
    createdAt: row.createdAt ? row.createdAt.getTime() : Date.now(),
    completedAt: toMs(row.completedAt),
    episodesWatched: null,
    totalEpisodes: null,
    lastEpisode: null,
    progressPercent: null,
    // `tableForType(type)` returns this type's table, so the row matches `type`.
    ...CARD_EXTRAS[type](row as ShelfRow[K]),
  };
}

export async function listShelfItems(userId: string, data: ShelfListArgs): Promise<ShelfCard[]> {
  const q = data.q.trim();
  // Filtered shelf lists are re-queried on every tab switch / keystroke.
  // Cache per user + filter for 60s; shelf writes invalidate the prefix.
  return cached(
    cacheKey(
      "u",
      userId,
      "shelves",
      "list",
      data.type,
      data.status ?? "all",
      hashKeyPart(`${normalizeCacheQuery(q)}:${data.limit}:${data.offset}`),
    ),
    CacheTTL.shelfReads,
    async (): Promise<ShelfCard[]> => {
      const db = await getDb();
      const table = tableForType(data.type);
      const pattern = `%${q}%`;
      const search = !q
        ? undefined
        : data.type === "book"
          ? or(ilike(books.title, pattern), ilike(books.author, pattern))
          : ilike(table.title, pattern);
      const rows = await db
        .select({ item: table })
        .from(table)
        .innerJoin(lists, eq(table.listId, lists.id))
        .where(
          and(
            eq(lists.ownerId, userId),
            data.status ? eq(table.status, data.status) : undefined,
            search,
          ),
        )
        .orderBy(desc(table.createdAt))
        .limit(data.limit)
        .offset(data.offset);
      return rows.map(({ item }) => toCard(data.type, item));
    },
  );
}

/** Folio detail for one shelf item — owner-scoped, null when not yours. */
export async function getShelfItem(
  userId: string,
  data: z.output<typeof shelfItemParams>,
): Promise<ShelfDetail> {
  const detail = await cached(
    // Detail opens repeat the same 2-3 queries; cache per user + item.
    // Episode ticks and status changes invalidate the user prefix.
    cacheKey("u", userId, "shelves", "detail", data.type, data.id),
    CacheTTL.shelfReads,
    async (): Promise<ShelfDetail | null> => {
      const db = await getDb();
      const owner = eq(lists.ownerId, userId);

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
        return { type: "movie", item: jsonRow(rows[0].movies), genres: g.map((r) => r.name) };
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
          item: jsonRow(rows[0].tv_shows),
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
        return { type: "book", item: jsonRow(rows[0].books), genres: g.map((r) => r.name) };
      }
      const rows = await db
        .select()
        .from(wishlistItems)
        .innerJoin(lists, eq(wishlistItems.listId, lists.id))
        .where(and(owner, eq(wishlistItems.id, data.id)))
        .limit(1);
      if (!rows[0]) return null;
      return { type: "wishlist", item: jsonRow(rows[0].wishlist_items) };
    },
    { skipCache: (detail) => detail === null },
  );
  if (!detail) throw notFound("Item not found");
  return detail;
}
