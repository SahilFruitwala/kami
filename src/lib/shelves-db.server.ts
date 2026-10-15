import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db.server";
import type { ItemStatus } from "@/lib/schema";
import {
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
  wishlistItems,
  type ItemType,
} from "@/lib/schema";

/** Server-side shelf helpers shared by the read and write server functions. */

export const shelfType = z.enum(["movie", "tv", "book", "wishlist", "restaurant", "place"]);
export const shelfStatus = z.enum(["to_try", "in_progress", "done", "abandoned"]);

/** Lowercase, punctuation-stripped title for duplicate checks (mirrors shelf). */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Keep only safe http(s) links; drop `javascript:`/`data:` etc. */
export function safeHttpUrl(value: string | null | undefined): string | undefined {
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

export function optionalInteger(value: string | undefined): number | null {
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
export async function getOrCreateDefaultList(userId: string, type: ItemType): Promise<string> {
  const db = await getDb();
  const existing = await db
    .select({ id: lists.id })
    .from(lists)
    .where(and(eq(lists.ownerId, userId), eq(lists.type, type), eq(lists.isDefault, true)))
    .limit(1);
  if (existing[0]) return existing[0].id;

  // Create under a per-(user, type) advisory lock so two concurrent first adds
  // can't create two default lists, and the list + owner membership commit
  // together.
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`default-list:${userId}:${type}`}))`,
    );
    const raced = await tx
      .select({ id: lists.id })
      .from(lists)
      .where(and(eq(lists.ownerId, userId), eq(lists.type, type), eq(lists.isDefault, true)))
      .limit(1);
    if (raced[0]) return raced[0].id;
    const listId = crypto.randomUUID();
    await tx.insert(lists).values({
      id: listId,
      name: DEFAULT_LIST_NAMES[type],
      type,
      ownerId: userId,
      isDefault: true,
    });
    await tx.insert(listMembers).values({ id: crypto.randomUUID(), listId, userId, role: "owner" });
    return listId;
  });
}

export type AppDb = Awaited<ReturnType<typeof getDb>>;
/** A database handle or an open transaction on it. */
export type DbOrTx = AppDb | Parameters<Parameters<AppDb["transaction"]>[0]>[0];

export async function syncGenres(
  db: DbOrTx,
  type: ItemType,
  itemId: string,
  genreValue: string | undefined,
) {
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
    await db.insert(tvShowGenres).values(names.map(([genreId]) => ({ tvShowId: itemId, genreId })));
  else await db.insert(bookGenres).values(names.map(([genreId]) => ({ bookId: itemId, genreId })));
}

export const addShelfItemInput = z.object({
  type: shelfType,
  title: z.string().min(1).max(300),
  notes: z.string().max(2000).optional(),
  link: z.string().max(2000).optional(),
  imageUrl: z.string().max(2000).optional(),
  metadata: z.record(z.string(), z.string()).optional(),
  status: z.enum(["to_try", "done"]).default("to_try"),
});

/** Drop oversize optional URLs before Zod max caps reject the whole insert. */
export function clampShelfItemInput(input: unknown): unknown {
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

export async function findExistingMovieOrTv(
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

export function isUniqueViolation(err: unknown): boolean {
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

type ShelfTable =
  | typeof movies
  | typeof tvShows
  | typeof books
  | typeof wishlistItems
  | typeof restaurants
  | typeof places;

export function tableForType(type: ItemType): ShelfTable {
  switch (type) {
    case "movie":
      return movies;
    case "tv":
      return tvShows;
    case "book":
      return books;
    case "wishlist":
      return wishlistItems;
    case "restaurant":
      return restaurants;
    case "place":
      return places;
  }
}

/** Owner-scoped row lookup — missing and “not yours” both return null. */
export async function findOwnedItem(
  userId: string,
  type: ItemType,
  id: string,
): Promise<{
  id: string;
  listId: string;
  title: string;
  status: ItemStatus;
} | null> {
  const db = await getDb();
  const table = tableForType(type);
  const rows = await db
    .select({
      id: table.id,
      listId: table.listId,
      title: table.title,
      status: table.status,
    })
    .from(table)
    .innerJoin(lists, eq(table.listId, lists.id))
    .where(and(eq(lists.ownerId, userId), eq(table.id, id)))
    .limit(1);
  return rows[0] ?? null;
}
