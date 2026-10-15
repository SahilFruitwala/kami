import type { z } from "zod";
import type { addShelfItemFields, bookProgressBody, shelfType } from "./schemas/shelves";
import type { BookCsvSource, GoodreadsBook } from "@/lib/goodreads";
import type { ItemStatus } from "@/lib/schema";
import type { ShelfCard, ShelfDetail, ShelfTab } from "@/lib/shelves";
import { http, orNull, seg } from "./client";
import type { EpisodeRow, ShelfDuplicate, ShowSeasons } from "./types";

/** Every shelf kind the API accepts (tabs plus the not-yet-surfaced ones). */
export type ShelfType = z.output<typeof shelfType>;

export type NewShelfItem = z.input<typeof addShelfItemFields>;

export type BookProgress = z.input<typeof bookProgressBody>;

const shelf = (type: ShelfType) => `/api/shelves/${seg(type)}`;
const item = (type: ShelfType, id: string) => `${shelf(type)}/${seg(id)}`;
const book = (id: string) => `/api/shelves/book/${seg(id)}`;
const show = (id: string) => `/api/shelves/tv/${seg(id)}`;

export const shelvesApi = {
  counts: () => http.get<Record<ShelfTab, number>>("/api/shelves/counts"),

  list: (
    type: ShelfType,
    opts: { status?: ItemStatus; query?: string; limit?: number; offset?: number } = {},
  ) =>
    http.get<ShelfCard[]>(shelf(type), {
      status: opts.status,
      q: opts.query || undefined,
      limit: opts.limit,
      offset: opts.offset,
    }),

  /** Folio detail, or null when missing / not yours. */
  get: (type: ShelfType, id: string) => orNull(http.get<ShelfDetail>(item(type, id))),

  add: (type: ShelfType, input: NewShelfItem) =>
    http.post<{ id: string; listId: string; type: ShelfType; status: ItemStatus }>(
      shelf(type),
      input,
    ),

  duplicates: (type: ShelfType, title: string, tmdbId?: string) =>
    http.get<ShelfDuplicate[]>(`${shelf(type)}/duplicates`, { title, tmdbId }),

  setStatus: (type: ShelfType, id: string, status: ItemStatus) =>
    http.patch<{ id: string; type: ShelfType; status: ItemStatus }>(item(type, id), { status }),

  remove: (type: ShelfType, id: string) => http.delete<{ deleted: boolean }>(item(type, id)),

  books: {
    setProgress: (id: string, progress: BookProgress) =>
      http.put<{ status: ItemStatus; percent: number }>(`${book(id)}/progress`, progress),

    /** Fill a missing page count from Open Library. */
    fillPageCount: (id: string) =>
      http.post<{ pageCount: number | null }>(`${book(id)}/page-count`),

    /** Bulk-add books from a parsed Goodreads / StoryGraph export; skips ones already shelved. */
    importBooks: (source: BookCsvSource, books: GoodreadsBook[]) =>
      http.post<{ imported: number; skipped: number }>("/api/shelves/book/import", {
        source,
        books,
      }),
  },

  tv: {
    seasons: (id: string) => http.get<ShowSeasons>(`${show(id)}/seasons`),

    episodes: (id: string, season: number) =>
      http.get<EpisodeRow[]>(`${show(id)}/seasons/${seg(season)}`),

    toggleEpisode: (id: string, season: number, number: number) =>
      http.post<{ watched: boolean }>(`${show(id)}/episodes/toggle`, { season, number }),

    setSeasonWatched: (id: string, season: number, numbers: number[], watched: boolean) =>
      http.put<void>(`${show(id)}/seasons/${seg(season)}`, { numbers, watched }),

    /** Tick every TMDB episode (or clear all) and set the show's status. */
    setWatched: (id: string, watched: boolean) =>
      http.put<void>(`${show(id)}/watched`, { watched }),
  },
};
