import { http } from "./client";
import type { CountryWatch, LookupResult } from "./types";

/** Third-party metadata lookups (TMDB, Open Library, link previews) — cached server-side. */
export const lookupApi = {
  tmdb: (query: string, kind: "movie" | "tv") =>
    http.get<LookupResult[]>("/api/lookup/tmdb", { q: query, kind }),

  books: (query: string) => http.get<LookupResult[]>("/api/lookup/books", { q: query }),

  /** og:title / og:image preview of a pasted URL; null when nothing usable was found. */
  link: (url: string) => http.get<LookupResult | null>("/api/lookup/link", { url }),

  watchProviders: (tmdbId: string, kind: "movie" | "tv") =>
    http.get<CountryWatch[]>("/api/lookup/watch-providers", { tmdbId, kind }),
};
