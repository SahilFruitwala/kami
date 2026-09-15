import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { assertPublicHttpUrl } from "@/lib/safe-url";

/**
 * Watchlist lookup providers — Postgres port of `shelf/src/server/lookup.ts`.
 *
 * How each source is processed (mirrors shelf):
 * - Movies/TV: `GET api.themoviedb.org/3/search/{movie,tv}` with a Bearer
 *   `TMDB_API_TOKEN`, `include_adult=false`. First 8 hits map to
 *   `LookupResult`: title, `w342` poster, themoviedb.org link, metadata
 *   `{ year, overview (≤300ch), genre (≤3 via static id map), tmdbId, tmdbKind }`.
 *   `tmdbId/tmdbKind` are kept so cards can fetch where-to-watch later.
 * - Books: `openlibrary.org/search.json` (limit 8, typed fields). Maps to
 *   `{ author, year, genre (≤3 filtered subjects), overview (first_sentence) }`,
 *   cover from `covers.openlibrary.org`, link to the work page. No key needed.
 * - Wishlist/URL: fetch the pasted link (SSRF-guarded via `assertPublicHttpUrl`
 *   on every redirect hop, browser UA) and read `og:title/og:image/og:description`
 *   with an Amazon DOM fallback (`#productTitle` / `#landingImage`).
 *
 * Places/Restaurants (Google Places API) are intentionally not ported — shelf
 * gates those behind `GOOGLE_PLACES_API_KEY` (metered upstream). Add
 * `searchPlaces` back if/when that key is configured.
 */

export type LookupResult = {
  title: string;
  imageUrl?: string;
  link?: string;
  metadata: Record<string, string>;
};

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

export const searchTmdb = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    z.object({ query: z.string().max(200), kind: z.enum(["movie", "tv"]) }).parse(input),
  )
  .handler(async ({ data }): Promise<LookupResult[]> => {
    const query = data.query.trim();
    if (query.length < 2) return [];
    const token = process.env.TMDB_API_TOKEN;
    if (!token) return [];

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
  });

type OpenLibraryDoc = {
  key: string;
  title: string;
  author_name?: string[];
  first_publish_year?: number;
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

export const searchBooks = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: unknown) => z.string().max(200).parse(input))
  .handler(async ({ data: query }): Promise<LookupResult[]> => {
    const q = query.trim();
    if (q.length < 2) return [];

    const url = new URL("https://openlibrary.org/search.json");
    url.searchParams.set("q", q);
    url.searchParams.set("limit", "8");
    url.searchParams.set(
      "fields",
      "key,title,author_name,first_publish_year,cover_i,subject,first_sentence",
    );

    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return [];
    const json = (await res.json()) as { docs?: OpenLibraryDoc[] };

    return (json.docs ?? []).map((d) => {
      const metadata: Record<string, string> = {};
      if (d.author_name?.length) metadata.author = d.author_name[0];
      if (d.first_publish_year) metadata.year = String(d.first_publish_year);
      const genre = bookGenres(d.subject);
      if (genre) metadata.genre = genre;
      const overview = bookBlurb(d.first_sentence);
      if (overview) metadata.overview = overview;
      return {
        title: d.title,
        imageUrl: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : undefined,
        link: `https://openlibrary.org${d.key}`,
        metadata,
      };
    });
  });

function extractMeta(html: string, property: string): string | undefined {
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']*)["']`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${property}["']`,
      "i",
    ),
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
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

function amazonFallback(html: string): { title?: string; imageUrl?: string } {
  const title = html
    .match(/<span[^>]+id=["']productTitle["'][^>]*>([^<]+)<\/span>/i)?.[1]
    ?.trim();
  let imageUrl = html.match(
    /id=["']landingImage["'][^>]*\bdata-old-hires=["']([^"']+)["']/i,
  )?.[1];
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

/** Fetch a URL with per-hop SSRF validation (mirrors extract.server's guard). */
async function fetchPreviewHtml(rawUrl: string): Promise<{ html: string; finalUrl: string } | null> {
  let current: string;
  try {
    current = assertPublicHttpUrl(rawUrl).href;
  } catch {
    return null;
  }
  for (let hop = 0; hop <= 5; hop += 1) {
    let res: Response;
    try {
      res = await fetch(current, {
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
        current = assertPublicHttpUrl(new URL(location, current).href).href;
      } catch {
        return null;
      }
      continue;
    }
    if (!res.ok) return null;
    try {
      current = assertPublicHttpUrl(res.url || current).href;
    } catch {
      return null;
    }
    const html = (await res.text()).slice(0, 500_000);
    return { html, finalUrl: current };
  }
  return null;
}

export const fetchLinkPreview = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: unknown) => z.string().max(2000).parse(input))
  .handler(async ({ data: rawUrl }): Promise<LookupResult | null> => {
    const fetched = await fetchPreviewHtml(rawUrl);
    if (!fetched) return null;
    const { html, finalUrl } = fetched;

    let title =
      extractMeta(html, "og:title") ?? html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim();
    let imageUrl = extractMeta(html, "og:image");

    if ((!title || !imageUrl) && /(^|\.)amazon\./i.test(new URL(finalUrl).hostname)) {
      const fallback = amazonFallback(html);
      title = title ?? fallback.title;
      imageUrl = imageUrl ?? fallback.imageUrl;
    }
    if (!title) return null;

    const metadata: Record<string, string> = {};
    const description = extractMeta(html, "og:description");
    if (description) metadata.description = description.slice(0, 300);
    const siteName = extractMeta(html, "og:site_name");
    if (siteName) metadata.source = siteName;

    return { title: decodeEntities(title), imageUrl, link: finalUrl, metadata };
  });
