import type { ItemStatus, books, movies, tvShows, wishlistItems } from "@/lib/schema";
import type { JsonRow } from "@/lib/api/types";

/** Client-safe shelf constants, paths, and row types (no server code). */

export const SHELF_TABS = ["movie", "tv", "book", "wishlist"] as const;
export type ShelfTab = (typeof SHELF_TABS)[number];

/** Canonical URL path for each shelf type (separate pages). */
export const SHELF_PATHS = {
  movie: "/shelves/movies",
  tv: "/shelves/series",
  book: "/shelves/books",
  wishlist: "/shelves/wishlist",
} as const satisfies Record<ShelfTab, `/${string}`>;

export type ShelfPath = (typeof SHELF_PATHS)[ShelfTab];

export function shelfPath(tab: ShelfTab): ShelfPath {
  return SHELF_PATHS[tab];
}

/** Map a legacy `?tab=` value (or path segment) to a ShelfTab. */
export function shelfTabFromParam(v: unknown): ShelfTab | null {
  if (v === "movie" || v === "movies") return "movie";
  if (v === "tv" || v === "series") return "tv";
  if (v === "book" || v === "books") return "book";
  if (v === "wishlist") return "wishlist";
  return null;
}

export type ShelfCard = {
  id: string;
  type: ShelfTab | "restaurant" | "place";
  title: string;
  imageUrl: string | null;
  status: ItemStatus;
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
  /** Books only — 0–100. */
  progressPercent: number | null;
  /** Wishlist only — the original product URL. */
  link?: string | null;
};

/** Folio detail as served by `GET /api/shelves/:type/:id` (dates are ISO strings). */
export type ShelfDetail =
  | { type: "movie"; item: JsonRow<typeof movies.$inferSelect>; genres: string[] }
  | {
      type: "tv";
      item: JsonRow<typeof tvShows.$inferSelect>;
      genres: string[];
      episodesTicked: number;
    }
  | { type: "book"; item: JsonRow<typeof books.$inferSelect>; genres: string[] }
  | { type: "wishlist"; item: JsonRow<typeof wishlistItems.$inferSelect> };
