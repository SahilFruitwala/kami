import "@tanstack/react-start/server-only";
import { z } from "zod";
import type { CountryWatch, LookupResult, WatchProvider } from "@/lib/api/types";
import {
  CacheTTL,
  cacheKey,
  cached,
  hashKeyPart,
  normalizeCacheQuery,
  invalidateUserCache,
} from "@/lib/cache.server.ts";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db.server";
import { books } from "@/lib/schema";
import { findOwnedItem } from "@/lib/shelves-db.server.ts";
import { notFound } from "@/server/http";

/**
 * Watchlist lookup providers — Postgres port of `shelf/src/server/lookup.ts`.
 *
 * How each source is processed (mirrors shelf):
 * - Movies/TV: `GET api.themoviedb.org/3/search/{movie,tv}` with a Bearer
 *   `TMDB_API_TOKEN`, `include_adult=false`. First 8 hits map to
 *   `LookupResult`: title, `w342` poster, themoviedb.org link, metadata
 *   `{ year, overview (≤300ch), genre (≤3 via static id map), tmdbId, tmdbKind }`.
 *   `tmdbId/tmdbKind` feed `fetchWatchProviders` for the where-to-watch strip.
 * - Books: `openlibrary.org/search.json` (limit 8, typed fields). Maps to
 *   `{ author, year, genre (≤3 filtered subjects), overview (first_sentence) }`,
 *   cover from `covers.openlibrary.org`, link to the work page. No key needed.
 * - Wishlist/URL: fetch the pasted link (SSRF-guarded via `assertPublicFetchUrl`
 *   on every redirect hop, browser UA) and read `og:title/og:image/og:description`
 *   with an Amazon DOM fallback (`#productTitle` / `#landingImage`).
 *
 * Places/Restaurants (Google Places API) are intentionally not ported — shelf
 * gates those behind `GOOGLE_PLACES_API_KEY` (metered upstream). Add
 * `searchPlaces` back if/when that key is configured.
 */

export const tmdbSearchQuery = z.object({
  q: z.string().max(200).default(""),
  kind: z.enum(["movie", "tv"]),
});

export const watchProvidersQuery = z.object({
  // Digits only: it is spliced into the TMDB path and a cross-user cache key.
  tmdbId: z
    .string()
    .trim()
    .regex(/^\d{1,12}$/, "Invalid TMDB id."),
  kind: z.enum(["movie", "tv"]),
});

export const bookSearchQuery = z.object({ q: z.string().max(200).default("") });

export const linkPreviewQuery = z.object({ url: z.string().max(2000) });

const TMDB_MOVIE_GENRES: Record<number, string> = {
  28: "Action",
  12: "Adventure",
  16: "Animation",
  35: "Comedy",
  80: "Crime",
  99: "Documentary",
  18: "Drama",
  10751: "Family",
  14: "Fantasy",
  36: "History",
  27: "Horror",
  10402: "Music",
  9648: "Mystery",
  10749: "Romance",
  878: "Sci-Fi",
  10770: "TV Movie",
  53: "Thriller",
  10752: "War",
  37: "Western",
};

const TMDB_TV_GENRES: Record<number, string> = {
  10759: "Action & Adventure",
  16: "Animation",
  35: "Comedy",
  80: "Crime",
  99: "Documentary",
  18: "Drama",
  10751: "Family",
  10762: "Kids",
  9648: "Mystery",
  10763: "News",
  10764: "Reality",
  10765: "Sci-Fi & Fantasy",
  10766: "Soap",
  10767: "Talk",
  10768: "War & Politics",
  37: "Western",
};

type TmdbResult = {
  id: number;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
  overview?: string;
  genre_ids?: number[];
};

export async function searchTmdb(data: z.output<typeof tmdbSearchQuery>): Promise<LookupResult[]> {
  const query = data.q.trim();
  if (query.length < 2) return [];
  const token = process.env.TMDB_API_TOKEN;
  if (!token) return [];

  // TMDB catalog data is stable for hours — serve repeat searches from
  // Upstash instead of burning latency + rate limit on every keystroke.
  // Empty results are not cached (they usually mean an upstream blip).
  return cached(
    cacheKey("lookup", "tmdb", data.kind, normalizeCacheQuery(query)),
    CacheTTL.tmdbSearch,
    async () => {
      const url = new URL(`https://api.themoviedb.org/3/search/${data.kind}`);
      url.searchParams.set("query", query);
      url.searchParams.set("include_adult", "false");

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return [];
      const json = (await res.json()) as { results?: TmdbResult[] };

      return (json.results ?? []).slice(0, 8).map((r) => {
        const title = (data.kind === "movie" ? r.title : r.name) ?? "Untitled";
        const date = data.kind === "movie" ? r.release_date : r.first_air_date;
        const metadata: Record<string, string> = {};
        if (date) metadata.year = date.slice(0, 4);
        if (r.overview) metadata.overview = r.overview.slice(0, 300);
        const genreMap = data.kind === "movie" ? TMDB_MOVIE_GENRES : TMDB_TV_GENRES;
        const genres = (r.genre_ids ?? [])
          .map((id) => genreMap[id])
          .filter(Boolean)
          .slice(0, 3);
        if (genres.length > 0) metadata.genre = genres.join(", ");
        metadata.tmdbId = String(r.id);
        metadata.tmdbKind = data.kind;
        return {
          title,
          imageUrl: r.poster_path ? `https://image.tmdb.org/t/p/w342${r.poster_path}` : undefined,
          link: `https://www.themoviedb.org/${data.kind}/${r.id}`,
          metadata,
        };
      });
    },
    { skipCache: (rows) => rows.length === 0 },
  );
}

// ---------- Where to watch (TMDB / JustWatch) ----------

type TmdbProvider = {
  provider_name: string;
  logo_path?: string | null;
  display_priority?: number;
};

type TmdbWatchRegion = {
  link?: string;
  flatrate?: TmdbProvider[];
  free?: TmdbProvider[];
  ads?: TmdbProvider[];
  rent?: TmdbProvider[];
  buy?: TmdbProvider[];
};

const regionNames =
  typeof Intl !== "undefined" && "DisplayNames" in Intl
    ? new Intl.DisplayNames(["en"], { type: "region" })
    : null;

/** Collapse ad tiers / channel resellers into the parent service name. */
function canonicalProviderName(name: string): string {
  return name
    .replace(/\s+(Apple TV|Amazon|Roku Premium)\s+Channel$/i, "")
    .replace(/\s+with Ads$/i, "")
    .replace(/\s+(Basic|Standard|Premium)$/i, "")
    .trim();
}

function dedupeProviders(lists: TmdbProvider[][]): WatchProvider[] {
  const seen = new Set<string>();
  const out: WatchProvider[] = [];
  for (const list of lists) {
    for (const p of [...list].sort(
      (a, b) => (a.display_priority ?? 0) - (b.display_priority ?? 0),
    )) {
      const name = canonicalProviderName(p.provider_name);
      if (seen.has(name)) continue;
      seen.add(name);
      out.push({
        name,
        logo: p.logo_path ? `https://image.tmdb.org/t/p/w92${p.logo_path}` : undefined,
      });
    }
  }
  return out;
}

/** Live streaming / rent availability for a TMDB movie or TV title. */
export async function fetchWatchProviders(
  data: z.output<typeof watchProvidersQuery>,
): Promise<CountryWatch[]> {
  const token = process.env.TMDB_API_TOKEN;
  if (!token) return [];

  // Availability changes slowly — a 24h entry turns every detail open
  // after the first into a Redis hit instead of a TMDB round-trip.
  return cached(
    cacheKey("lookup", "watch", data.kind, data.tmdbId.trim().slice(0, 32)),
    CacheTTL.watchProviders,
    async () => {
      const res = await fetch(
        `https://api.themoviedb.org/3/${data.kind}/${data.tmdbId}/watch/providers`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (!res.ok) return [];
      const json = (await res.json()) as { results?: Record<string, TmdbWatchRegion> };
      const results = json.results ?? {};

      const countries: CountryWatch[] = [];
      for (const [code, r] of Object.entries(results)) {
        const streaming = dedupeProviders([r.flatrate ?? [], r.free ?? [], r.ads ?? []]).slice(
          0,
          8,
        );
        const rent = dedupeProviders([r.rent ?? [], r.buy ?? []]).slice(0, 8);
        if (streaming.length === 0 && rent.length === 0) continue;
        countries.push({
          code,
          name: regionNames?.of(code) ?? code,
          streaming,
          rent,
          link: r.link,
        });
      }

      countries.sort((a, b) => a.name.localeCompare(b.name));
      return countries;
    },
    { skipCache: (rows) => rows.length === 0 },
  );
}

type OpenLibraryDoc = {
  key: string;
  title: string;
  author_name?: string[];
  first_publish_year?: number;
  number_of_pages_median?: number;
  cover_i?: number;
  subject?: string[];
  first_sentence?: string | string[] | { value?: string };
};

const SKIP_BOOK_SUBJECTS =
  /^(accessible book|protected daisy|in library|overdrive|nyt[:.]|large type|open library|internet archive)/i;

function bookBlurb(value: OpenLibraryDoc["first_sentence"]): string | undefined {
  const raw = Array.isArray(value)
    ? value[0]
    : typeof value === "object" && value
      ? value.value
      : value;
  const text = raw?.trim();
  if (!text) return undefined;
  return text.slice(0, 300);
}

function bookGenres(subjects: string[] | undefined): string | undefined {
  if (!subjects?.length) return undefined;
  const picked = subjects
    .map((s) => s.trim())
    .filter((s) => s.length > 1 && s.length <= 32 && !SKIP_BOOK_SUBJECTS.test(s))
    .slice(0, 3);
  return picked.length > 0 ? picked.join(", ") : undefined;
}

export async function searchBooks(data: z.output<typeof bookSearchQuery>): Promise<LookupResult[]> {
  const q = data.q.trim();
  if (q.length < 2) return [];

  // Catalog data — safe to share across users, stable for hours.
  return cached(
    cacheKey("lookup", "books", normalizeCacheQuery(q)),
    CacheTTL.bookSearch,
    async () => {
      const url = new URL("https://openlibrary.org/search.json");
      url.searchParams.set("q", q);
      url.searchParams.set("limit", "8");
      url.searchParams.set(
        "fields",
        "key,title,author_name,first_publish_year,cover_i,subject,first_sentence,number_of_pages_median",
      );

      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) return [];
      const json = (await res.json()) as { docs?: OpenLibraryDoc[] };

      return (json.docs ?? []).map((d) => {
        const metadata: Record<string, string> = {};
        if (d.author_name?.length) metadata.author = d.author_name[0];
        if (d.first_publish_year) metadata.year = String(d.first_publish_year);
        if (d.number_of_pages_median && d.number_of_pages_median > 0)
          metadata.pages = String(d.number_of_pages_median);
        const genre = bookGenres(d.subject);
        if (genre) metadata.genre = genre;
        const overview = bookBlurb(d.first_sentence);
        if (overview) metadata.overview = overview;
        return {
          title: d.title,
          imageUrl: d.cover_i
            ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg`
            : undefined,
          link: `https://openlibrary.org${d.key}`,
          metadata,
        };
      });
    },
    { skipCache: (rows) => rows.length === 0 },
  );
}

function extractMeta(html: string, property: string): string | undefined {
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${property}["']`, "i"),
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m?.[1]) return decodeEntities(m[1].trim());
  }
  return undefined;
}

function decodeEntities(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'");
}

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

function amazonFallback(html: string): { title?: string; imageUrl?: string } {
  const title = html.match(/<span[^>]+id=["']productTitle["'][^>]*>([^<]+)<\/span>/i)?.[1]?.trim();
  let imageUrl = html.match(/id=["']landingImage["'][^>]*\bdata-old-hires=["']([^"']+)["']/i)?.[1];
  if (!imageUrl) {
    const dynamic = html.match(
      /id=["']landingImage["'][^>]*\bdata-a-dynamic-image=["']([^"']+)["']/i,
    )?.[1];
    if (dynamic) {
      imageUrl = decodeEntities(dynamic).match(/"(https?:\/\/[^"]+)"/)?.[1];
    }
  }
  return { title: title ? decodeEntities(title) : undefined, imageUrl };
}

/** Fetch a URL with per-hop SSRF + DNS validation (mirrors extract.server's guard). */
async function fetchPreviewHtml(
  rawUrl: string,
): Promise<{ html: string; finalUrl: string } | null> {
  const { assertPublicFetchUrl, publicFetch } = await import("@/lib/safe-url.server");
  let current: string;
  try {
    current = (await assertPublicFetchUrl(rawUrl)).href;
  } catch {
    return null;
  }
  for (let hop = 0; hop <= 5; hop += 1) {
    let res: Response;
    try {
      res = await publicFetch(current, {
        redirect: "manual",
        signal: AbortSignal.timeout(8000),
        headers: BROWSER_HEADERS,
      });
    } catch {
      return null;
    }
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      await res.arrayBuffer().catch(() => undefined);
      if (!location) return null;
      try {
        current = (await assertPublicFetchUrl(new URL(location, current).href)).href;
      } catch {
        return null;
      }
      continue;
    }
    if (!res.ok) return null;
    try {
      current = (await assertPublicFetchUrl(res.url || current)).href;
    } catch {
      return null;
    }
    let html: string;
    try {
      const { readCapped } = await import("@/lib/read-capped.server");
      html = new TextDecoder("utf-8").decode(await readCapped(res, 2_000_000)).slice(0, 500_000);
    } catch {
      return null;
    }
    return { html, finalUrl: current };
  }
  return null;
}

/**
 * Sites that block plain server fetches (bot walls, JS-only pages) are retried
 * through Firecrawl; if that is unavailable too, the link still saves with a
 * title derived from its address rather than failing outright.
 */
async function firecrawlPreview(rawUrl: string): Promise<LookupResult | null> {
  const { assertPublicFetchUrl } = await import("@/lib/safe-url.server");
  let url: URL;
  try {
    url = await assertPublicFetchUrl(rawUrl);
  } catch {
    return null;
  }
  const { firecrawlApiKey, readPageMetadata } = await import("@/lib/firecrawl.server");
  if (firecrawlApiKey()) {
    try {
      const meta = await readPageMetadata(url.href);
      if (meta.title) {
        const metadata: Record<string, string> = {};
        if (meta.description) metadata.description = meta.description.slice(0, 300);
        if (meta.siteName) metadata.source = meta.siteName;
        return {
          title: decodeEntities(meta.title).slice(0, 300),
          imageUrl: meta.imageUrl && meta.imageUrl.length <= 2000 ? meta.imageUrl : undefined,
          link: url.href.slice(0, 2000),
          metadata,
        };
      }
    } catch {
      // fall through to the address-derived title
    }
  }
  const host = url.hostname.replace(/^www\./, "");
  const slug = url.pathname.split("/").filter(Boolean).pop()?.replace(/[-_]+/g, " ").trim();
  return {
    title: (slug && !/^\d+$/.test(slug) ? `${slug} · ${host}` : host).slice(0, 300),
    link: url.href.slice(0, 2000),
    metadata: { source: host },
  };
}

export async function fetchLinkPreview(
  data: z.output<typeof linkPreviewQuery>,
): Promise<LookupResult | null> {
  const rawUrl = data.url;
  // Fetching + parsing a full page costs seconds; og metadata barely
  // changes, so cache hits (7d) make repeat pastes feel instant.
  // Keyed by URL hash — never by user — since previews aren't personal.
  const cacheableUrl = rawUrl.trim().slice(0, 2000);
  return cached(
    cacheKey("lookup", "link", hashKeyPart(cacheableUrl)),
    CacheTTL.linkPreview,
    async () => {
      const fetched = await fetchPreviewHtml(rawUrl);
      if (!fetched) return firecrawlPreview(rawUrl);
      const { html, finalUrl } = fetched;

      let title =
        extractMeta(html, "og:title") ?? html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim();
      let imageUrl = extractMeta(html, "og:image");

      if ((!title || !imageUrl) && /(^|\.)amazon\./i.test(new URL(finalUrl).hostname)) {
        const fallback = amazonFallback(html);
        title = title ?? fallback.title;
        imageUrl = imageUrl ?? fallback.imageUrl;
      }
      if (!title) return firecrawlPreview(rawUrl);

      const metadata: Record<string, string> = {};
      const description = extractMeta(html, "og:description");
      if (description) metadata.description = description.slice(0, 300);
      const siteName = extractMeta(html, "og:site_name");
      if (siteName) metadata.source = siteName;

      return {
        title: decodeEntities(title).slice(0, 300),
        imageUrl: imageUrl && imageUrl.length <= 2000 ? imageUrl : undefined,
        link: finalUrl.slice(0, 2000),
        metadata,
      };
    },
    { skipCache: (preview) => preview === null },
  );
}

const OPEN_LIBRARY_WORK = /^https:\/\/openlibrary\.org(\/works\/OL\d+W)$/;

/**
 * Open Library's median page count for a work — by its exact work key when
 * the book was added from search, else the best title + author match.
 * Returns `undefined` when Open Library could not be reached (not cached).
 */
async function openLibraryPageCount(book: {
  link: string | null;
  title: string;
  author: string | null;
}): Promise<{ pages: number | null } | undefined> {
  const workKey = book.link ? OPEN_LIBRARY_WORK.exec(book.link)?.[1] : undefined;
  const lookup = workKey ?? `${book.title}|${book.author ?? ""}`;
  return cached(
    cacheKey("lookup", "book-pages", hashKeyPart(normalizeCacheQuery(lookup))),
    CacheTTL.bookSearch,
    async () => {
      const url = new URL("https://openlibrary.org/search.json");
      if (workKey) {
        url.searchParams.set("q", `key:${workKey}`);
      } else {
        url.searchParams.set("title", book.title);
        if (book.author) url.searchParams.set("author", book.author);
      }
      url.searchParams.set("limit", "1");
      url.searchParams.set("fields", "key,number_of_pages_median");
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
        if (!res.ok) return undefined;
        const json = (await res.json()) as { docs?: { number_of_pages_median?: number }[] };
        const pages = json.docs?.[0]?.number_of_pages_median;
        return { pages: pages && pages > 0 ? pages : null };
      } catch {
        return undefined;
      }
    },
    // Cache "Open Library has no count" too; only network failures retry.
    { skipCache: (v) => v === undefined },
  );
}

/**
 * Fill a book's missing page count from Open Library. Never overwrites a
 * count the reader typed. Returns the stored count (or null if unknown).
 */
export async function fillBookPageCount(
  userId: string,
  id: string,
): Promise<{ pageCount: number | null }> {
  const data = { id };
  const owned = await findOwnedItem(userId, "book", data.id);
  if (!owned) throw notFound("Item not found");

  const db = await getDb();
  const [book] = await db
    .select({
      title: books.title,
      author: books.author,
      link: books.link,
      pageCount: books.pageCount,
    })
    .from(books)
    .where(eq(books.id, data.id))
    .limit(1);
  if (!book) throw notFound("Item not found");
  if (book.pageCount) return { pageCount: book.pageCount };

  const found = await openLibraryPageCount(book);
  const pages = found?.pages ?? null;
  if (pages == null) return { pageCount: null };

  // `isNull` guard: a count typed meanwhile wins over the lookup.
  await db
    .update(books)
    .set({ pageCount: pages })
    .where(and(eq(books.id, data.id), isNull(books.pageCount)));
  await invalidateUserCache(userId, "shelves");
  return { pageCount: pages };
}
