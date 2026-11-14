/**
 * Google Books volume → shelf lookup mapping. Pure — shared by the server
 * lookup and tests. The Books API is the primary book catalog (Open Library
 * remains a fallback when Google returns nothing).
 *
 * https://developers.google.com/books/docs/v1/using
 */

import type { LookupResult } from "@/lib/api/types";

export type GoogleBookImageLinks = {
  extraLarge?: string;
  large?: string;
  medium?: string;
  small?: string;
  thumbnail?: string;
  smallThumbnail?: string;
};

export type GoogleBookVolume = {
  id?: string;
  volumeInfo?: {
    title?: string;
    authors?: string[];
    publishedDate?: string;
    description?: string;
    pageCount?: number;
    categories?: string[];
    imageLinks?: GoogleBookImageLinks;
    canonicalVolumeLink?: string;
    infoLink?: string;
    industryIdentifiers?: { type?: string; identifier?: string }[];
  };
};

/** Volume ids are opaque tokens Google puts in paths and `?id=`. */
const VOLUME_ID = /^[A-Za-z0-9_-]{1,40}$/;

export function isGoogleVolumeId(value: string | null | undefined): value is string {
  return Boolean(value && VOLUME_ID.test(value));
}

/**
 * Pull a volume id from a Google Books / Play Books URL, or from a bare id
 * stored on the shelf. Null when the link is something else (Open Library,
 * Goodreads, a pasted shop URL).
 */
export function googleVolumeIdFromLink(link: string | null | undefined): string | undefined {
  const raw = link?.trim();
  if (!raw) return undefined;
  if (isGoogleVolumeId(raw)) return raw;
  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./, "");
    const fromQuery = url.searchParams.get("id");
    if (fromQuery && isGoogleVolumeId(fromQuery) && isGoogleBooksHost(host)) {
      return fromQuery;
    }
    const edition = url.pathname.match(/\/books\/edition\/[^/]+\/([^/?#]+)/);
    if (edition?.[1] && isGoogleVolumeId(edition[1]) && isGoogleBooksHost(host)) {
      return edition[1];
    }
    const ebooks = url.pathname.match(/\/ebooks\/id\/([^/?#]+)/);
    if (ebooks?.[1] && isGoogleVolumeId(ebooks[1])) return ebooks[1];
  } catch {
    return undefined;
  }
  return undefined;
}

function isGoogleBooksHost(host: string): boolean {
  return (
    host === "books.google.com" ||
    host.endsWith(".google.com") ||
    host === "play.google.com" ||
    host === "google.com"
  );
}

/** HTTPS, slightly larger than the default thumbnail, no fake page-curl. */
export function googleBooksCoverUrl(
  imageLinks: GoogleBookImageLinks | undefined,
): string | undefined {
  const raw =
    imageLinks?.medium ||
    imageLinks?.large ||
    imageLinks?.small ||
    imageLinks?.thumbnail ||
    imageLinks?.smallThumbnail;
  if (!raw?.trim()) return undefined;
  return upgradeGoogleBooksCover(raw.trim());
}

export function upgradeGoogleBooksCover(url: string): string {
  try {
    const u = new URL(url.replace(/^http:\/\//i, "https://"));
    if (!isGoogleCoverHost(u.hostname)) return u.href;
    const zoom = Number(u.searchParams.get("zoom"));
    if (!Number.isFinite(zoom) || zoom < 2) u.searchParams.set("zoom", "2");
    u.searchParams.delete("edge");
    return u.href;
  } catch {
    return url.replace(/^http:\/\//i, "https://");
  }
}

function isGoogleCoverHost(host: string): boolean {
  return (
    host === "books.google.com" ||
    host.endsWith(".books.google.com") ||
    host.endsWith("googleusercontent.com")
  );
}

export function googleBooksIsbn(volume: GoogleBookVolume): string | undefined {
  const ids = volume.volumeInfo?.industryIdentifiers ?? [];
  const isbn13 = ids.find((i) => i.type === "ISBN_13")?.identifier;
  const isbn10 = ids.find((i) => i.type === "ISBN_10")?.identifier;
  const digits = (isbn13 ?? isbn10)?.replace(/[^0-9X]/gi, "").toUpperCase();
  if (digits && (digits.length === 10 || digits.length === 13)) return digits;
  return undefined;
}

export function mapGoogleBookVolume(volume: GoogleBookVolume): LookupResult | null {
  const info = volume.volumeInfo;
  const title = info?.title?.trim();
  if (!info || !title) return null;

  const metadata: Record<string, string> = {};
  if (volume.id && isGoogleVolumeId(volume.id)) metadata.googleVolumeId = volume.id;
  if (info.authors?.length) metadata.author = info.authors[0]!.trim();
  const year = info.publishedDate?.match(/^(\d{4})/)?.[1];
  if (year) metadata.year = year;
  if (info.pageCount && info.pageCount > 0) metadata.pages = String(info.pageCount);
  const genre = bookGenres(info.categories);
  if (genre) metadata.genre = genre;
  const overview = stripHtmlBlurb(info.description);
  if (overview) metadata.overview = overview;
  const isbn = googleBooksIsbn(volume);
  if (isbn) metadata.isbn = isbn;

  const link =
    (volume.id && isGoogleVolumeId(volume.id)
      ? `https://books.google.com/books?id=${volume.id}`
      : undefined) ??
    info.canonicalVolumeLink ??
    info.infoLink;

  return {
    title,
    imageUrl: googleBooksCoverUrl(info.imageLinks),
    link: link && link.length <= 2000 ? link : undefined,
    metadata,
  };
}

function bookGenres(categories: string[] | undefined): string | undefined {
  if (!categories?.length) return undefined;
  const picked = categories
    .flatMap((c) => c.split("/"))
    .map((s) => s.trim())
    .filter((s) => s.length > 1 && s.length <= 32)
    .slice(0, 3);
  const unique = [...new Set(picked)];
  return unique.length > 0 ? unique.join(", ") : undefined;
}

/** Google descriptions are often HTML (`<p>`, `<b>`). Shelf overviews are plain. */
export function stripHtmlBlurb(value: string | undefined, max = 300): string | undefined {
  if (!value?.trim()) return undefined;
  const text = value
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/p>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return undefined;
  return text.slice(0, max);
}
