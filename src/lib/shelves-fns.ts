import { and, count, desc, eq, ilike, or } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getDb } from "@/lib/db";
import {
  activity,
  bookGenres,
  books,
  genres,
  listMembers,
  lists,
  movieGenres,
  movies,
  places,
  restaurants,
  tvShowGenres,
  tvShows,
  watchedEpisodes,
  wishlistItems,
  type ItemType,
} from "@/lib/schema";

export const SHELF_TABS = ["movie", "tv", "book", "wishlist"] as const;
export type ShelfTab = (typeof SHELF_TABS)[number];

const shelfType = z.enum(["movie", "tv", "book", "wishlist", "restaurant", "place"]);
const shelfStatus = z.enum(["to_try", "done", "abandoned"]);

export type ShelfCard = {
  id: string;
  type: ShelfTab | "restaurant" | "place";
  title: string;
  imageUrl: string | null;
  status: "to_try" | "done" | "abandoned";
  /** Second line: author / year / price / address depending on type. */
  subtitle: string | null;
  overview: string | null;
  year: number | null;
  createdAt: number;
  completedAt: number | null;
  /** TV only. */
  episodesWatched: number | null;
  totalEpisodes: number | null;
  lastEpisode: string | null;
};

function toMs(v: Date | null): number | null {
  return v ? v.getTime() : null;
}

export const getShelfCounts = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<Record<ShelfTab, number>> => {
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
    const db = await getDb();
    const q = data.query.trim();
    const owner = eq(lists.ownerId, context.userId);

    if (data.type === "movie") {
      const conds = [owner, data.status ? eq(movies.status, data.status) : undefined, q ? ilike(movies.title, `%${q}%`) : undefined].filter(Boolean);
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
      }));
    }

    if (data.type === "tv") {
      const conds = [owner, data.status ? eq(tvShows.status, data.status) : undefined, q ? ilike(tvShows.title, `%${q}%`) : undefined].filter(Boolean);
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
            : (r.releaseYear ? String(r.releaseYear) : null),
        overview: r.overview,
        year: r.releaseYear,
        createdAt: r.createdAt ? r.createdAt.getTime() : Date.now(),
        completedAt: toMs(r.completedAt),
        episodesWatched: r.episodesWatched,
        totalEpisodes: r.totalEpisodes,
        lastEpisode: r.lastEpisode,
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
      }));
    }

    if (data.type === "wishlist") {
      const conds = [owner, data.status ? eq(wishlistItems.status, data.status) : undefined, q ? ilike(wishlistItems.title, `%${q}%`) : undefined].filter(Boolean);
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
      }));
    }

    if (data.type === "restaurant") {
      const conds = [owner, data.status ? eq(restaurants.status, data.status) : undefined, q ? ilike(restaurants.title, `%${q}%`) : undefined].filter(Boolean);
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
      }));
    }

    const conds = [owner, data.status ? eq(places.status, data.status) : undefined, q ? ilike(places.title, `%${q}%`) : undefined].filter(Boolean);
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
    }));
  });

export type ShelfDetail =
  | { type: "movie"; item: typeof movies.$inferSelect; genres: string[] }
  | { type: "tv"; item: typeof tvShows.$inferSelect; genres: string[]; episodesTicked: number }
  | { type: "book"; item: typeof books.$inferSelect; genres: string[] }
  | { type: "wishlist"; item: typeof wishlistItems.$inferSelect };

/** Folio detail for one shelf item — owner-scoped, null when not yours. */
export const getShelfItem = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    z.object({ type: shelfType, id: z.string().min(1).max(200) }).parse(input),
  )
  .handler(async ({ context, data }): Promise<ShelfDetail | null> => {
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
  });

// ---------- Add (port of shelf/src/server/items.ts:addItem) ----------

/** Lowercase, punctuation-stripped title for duplicate checks (mirrors shelf). */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Keep only safe http(s) links; drop `javascript:`/`data:` etc. */
function safeHttpUrl(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function optionalInteger(value: string | undefined): number | null {
  if (!value?.trim()) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

const DEFAULT_LIST_NAMES: Record<ItemType, string> = {
  restaurant: "Restaurants",
  movie: "Movies",
  tv: "TV series",
  book: "Books",
  place: "Places",
  wishlist: "Wishlist",
};

/** The user's default shelf for a type, created on first use. */
async function getOrCreateDefaultList(userId: string, type: ItemType): Promise<string> {
  const db = await getDb();
  const existing = await db
    .select({ id: lists.id })
    .from(lists)
    .where(and(eq(lists.ownerId, userId), eq(lists.type, type), eq(lists.isDefault, true)))
    .limit(1);
  if (existing[0]) return existing[0].id;

  const listId = crypto.randomUUID();
  await db.insert(lists).values({
    id: listId,
    name: DEFAULT_LIST_NAMES[type],
    type,
    ownerId: userId,
    isDefault: true,
  });
  await db.insert(listMembers).values({ id: crypto.randomUUID(), listId, userId, role: "owner" });
  return listId;
}

type AppDb = Awaited<ReturnType<typeof getDb>>;

async function syncGenres(db: AppDb, type: ItemType, itemId: string, genreValue: string | undefined) {
  if (type !== "movie" && type !== "tv" && type !== "book") return;
  if (type === "movie") await db.delete(movieGenres).where(eq(movieGenres.movieId, itemId));
  else if (type === "tv") await db.delete(tvShowGenres).where(eq(tvShowGenres.tvShowId, itemId));
  else await db.delete(bookGenres).where(eq(bookGenres.bookId, itemId));

  const names = [
    ...new Map(
      (genreValue ?? "")
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean)
        .map((name) => [name.toLocaleLowerCase(), name] as const),
    ),
  ];
  if (names.length === 0) return;

  await db
    .insert(genres)
    .values(names.map(([normalizedName, name]) => ({ id: normalizedName, name, normalizedName })))
    .onConflictDoNothing();

  if (type === "movie")
    await db.insert(movieGenres).values(names.map(([genreId]) => ({ movieId: itemId, genreId })));
  else if (type === "tv")
    await db
      .insert(tvShowGenres)
      .values(names.map(([genreId]) => ({ tvShowId: itemId, genreId })));
  else await db.insert(bookGenres).values(names.map(([genreId]) => ({ bookId: itemId, genreId })));
}

const addShelfItemInput = z.object({
  type: shelfType,
  title: z.string().min(1).max(300),
  notes: z.string().max(2000).optional(),
  link: z.string().max(2000).optional(),
  imageUrl: z.string().max(2000).optional(),
  metadata: z.record(z.string(), z.string()).optional(),
  status: z.enum(["to_try", "done"]).default("to_try"),
});

/** Drop oversize optional URLs before Zod max caps reject the whole insert. */
function clampShelfItemInput(input: unknown): unknown {
  if (!input || typeof input !== "object") return input;
  const o = input as Record<string, unknown>;
  const trimCap = (v: unknown, max: number) => {
    if (typeof v !== "string") return v;
    const t = v.trim();
    if (!t) return undefined;
    return t.length <= max ? t : undefined;
  };
  return {
    ...o,
    title: typeof o.title === "string" ? o.title.trim().slice(0, 300) : o.title,
    notes: typeof o.notes === "string" ? o.notes.slice(0, 2000) : o.notes,
    link: trimCap(o.link, 2000),
    imageUrl: trimCap(o.imageUrl, 2000),
  };
}

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

    try {
      if (data.type === "movie") {
        await db.insert(movies).values({
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
        await db.insert(tvShows).values({
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
        await db.insert(books).values({
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
        await db.insert(restaurants).values({
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
        await db.insert(places).values({
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
        await db.insert(wishlistItems).values({
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
    } catch (err) {
      // Race: unique indexes on movies/tv may reject a concurrent insert.
      if (
        (data.type === "movie" || data.type === "tv") &&
        isUniqueViolation(err)
      ) {
        throw new Error("Already on your shelf");
      }
      throw err;
    }

    await syncGenres(db, data.type, id, metadata.genre);
    await db.insert(activity).values({
      id: crypto.randomUUID(),
      listId,
      userId: context.userId,
      action: status === "done" ? "completed" : "added",
      itemTitle: title,
      itemType: data.type,
    });
    return { id, listId, type: data.type, status };
  });

async function findExistingMovieOrTv(
  db: Awaited<ReturnType<typeof getDb>>,
  type: "movie" | "tv",
  listId: string,
  keys: { tmdbId: number | null; normalizedTitle: string },
): Promise<{ id: string; title: string; status: string } | null> {
  const table = type === "movie" ? movies : tvShows;
  if (keys.tmdbId != null) {
    const byTmdb = await db
      .select({ id: table.id, title: table.title, status: table.status })
      .from(table)
      .where(and(eq(table.listId, listId), eq(table.tmdbId, keys.tmdbId)))
      .limit(1);
    if (byTmdb[0]) return byTmdb[0];
  }
  if (!keys.normalizedTitle) return null;
  const byTitle = await db
    .select({ id: table.id, title: table.title, status: table.status })
    .from(table)
    .where(and(eq(table.listId, listId), eq(table.normalizedTitle, keys.normalizedTitle)))
    .limit(1);
  return byTitle[0] ?? null;
}

function isUniqueViolation(err: unknown): boolean {
  const codes = new Set<string>();
  const messages: string[] = [];
  let cur: unknown = err;
  for (let i = 0; i < 4 && cur && typeof cur === "object"; i++) {
    if ("code" in cur && cur.code != null) codes.add(String(cur.code));
    if ("message" in cur && cur.message != null) messages.push(String(cur.message));
    cur = "cause" in cur ? cur.cause : null;
  }
  if (codes.has("23505")) return true;
  return messages.some((m) => /unique|duplicate key/i.test(m));
}

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
      .where(
        and(eq(wishlistItems.listId, listId), eq(wishlistItems.normalizedTitle, normalized)),
      )
      .limit(5);
  });
