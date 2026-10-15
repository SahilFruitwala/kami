/**
 * Request/response contracts shared by `/api/*` route handlers
 * (`src/server/services`) and the browser client (`src/lib/api/*`).
 *
 * Keep this file free of runtime dependencies on server code — it ships to
 * the browser. Types only, plus a few plain constants both sides need.
 */
import type { Folder, LibraryItem } from "@/lib/library-item";

/* ---------- Library ---------- */

export type LibrarySnapshot = {
  library: LibraryItem[];
  folders: Folder[];
};

/** Keyset cursor into the `saved_at DESC, id DESC` library ordering. */
export type LibraryCursor = { savedAt: number; id: string };

export type LibraryPage = {
  library: LibraryItem[];
  /** Full folder list on the first page; empty on follow-ups. */
  folders: Folder[];
  /** Null when the end of the library is reached. */
  nextCursor: LibraryCursor | null;
  /** Total article count — computed on the first page only. */
  total: number | null;
};

/** Rows per boot page: enough for an instant first paint, small to serialize. */
export const LIBRARY_BOOT_LIMIT = 100;

/**
 * `POST /api/library/save` — one URL fetched, extracted and stored on the
 * server. `existed` is true when the URL was already in the library (the
 * stored row is returned untouched).
 */
export type SaveUrlResult =
  { ok: true; item: LibraryItem; existed: boolean } | { ok: false; error: string };

export type BulkSaveLinksResult = {
  saved: LibraryItem[];
  skipped: string[];
  errors: { url: string; error: string }[];
};

/* ---------- Journal ---------- */

export const JOURNAL_IMPORT_MAX = 2000;

/* ---------- Shelves ---------- */

export type ShelfDuplicate = { id: string; title: string; status: string };

export type EpisodeRow = {
  season: number;
  number: number;
  title: string;
  airDate: string | null;
  watched: boolean;
};

export type SeasonRow = {
  season: number;
  name: string;
  episodeCount: number;
  watchedCount: number;
};

export type ShowSeasons = {
  seasons: SeasonRow[];
  hasTmdb: boolean;
  watchedTotal: number;
  unmatched: number;
};

/* ---------- Lookups ---------- */

export type LookupResult = {
  title: string;
  imageUrl?: string;
  link?: string;
  metadata: Record<string, string>;
};

export type WatchProvider = {
  name: string;
  logo?: string;
};

export type CountryWatch = {
  code: string;
  name: string;
  streaming: WatchProvider[];
  rent: WatchProvider[];
  link?: string;
};

/* ---------- Serialization ---------- */

/** Shape of a DB row after a JSON round-trip: `Date` columns arrive as ISO strings. */
export type JsonRow<T> = {
  [K in keyof T]: T[K] extends Date ? string : T[K] extends Date | null ? string | null : T[K];
};
