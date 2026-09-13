import { preferReadableImage } from "./image-url.ts";
import { assertPublicHttpUrl } from "./safe-url.ts";

export const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

export const FETCH_TIMEOUT_MS = 12_000;
const MAX_IMAGE_BYTES = 1_200_000;

function refererFor(url: URL): string {
  const host = url.hostname;
  if (host.endsWith("wikimedia.org") || host.endsWith("wikipedia.org")) {
    return "https://en.wikipedia.org/";
  }
  if (host.endsWith("twimg.com") || host.endsWith("twitter.com") || host === "x.com" || host.endsWith(".x.com")) {
    return "https://x.com/";
  }
  if (host.endsWith("substackcdn.com") || host.endsWith("substack.com")) {
    return "https://substack.com/";
  }
  if (host.endsWith("medium.com") || host.endsWith("medium.com")) {
    return "https://medium.com/";
  }
  return `${url.protocol}//${url.host}/`;
}

export type FetchedImage =
  | { ok: true; bytes: Uint8Array; mime: string }
  | { ok: false; error: string; status: number };

export async function fetchImageBytes(rawUrl: string): Promise<FetchedImage> {
  let original: URL;
  try {
    original = assertPublicHttpUrl(rawUrl);
  } catch {
    return { ok: false, error: "invalid image url", status: 400 };
  }

  const upgraded = preferReadableImage(original.href);
  const candidates = upgraded === original.href ? [original.href] : [upgraded, original.href];

  let last: FetchedImage = { ok: false, error: "could not fetch image", status: 502 };
  for (const href of candidates) {
    last = await getImage(href);
    if (last.ok) return last;
  }
  return last;
}

async function getImage(href: string): Promise<FetchedImage> {
  let parsed: URL;
  try {
    parsed = assertPublicHttpUrl(href);
  } catch {
    return { ok: false, error: "invalid image url", status: 400 };
  }

  try {
    const res = await fetch(parsed.href, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        "user-agent": USER_AGENT,
        accept: "image/jpeg,image/png,image/gif,image/svg+xml,image/*;q=0.4,*/*;q=0.1",
        referer: refererFor(parsed),
      },
    });
    if (!res.ok) {
      return { ok: false, error: `upstream ${res.status}`, status: res.status === 404 ? 404 : 502 };
    }
    const mime = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (mime && !mime.startsWith("image/") && mime !== "application/octet-stream") {
      return { ok: false, error: "not an image", status: 415 };
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength === 0) {
      return { ok: false, error: "empty image", status: 502 };
    }
    if (bytes.byteLength > MAX_IMAGE_BYTES) {
      return { ok: false, error: "image too large", status: 413 };
    }
    return { ok: true, bytes, mime: sniffMime(bytes, mime) };
  } catch {
    return { ok: false, error: "could not fetch image", status: 502 };
  }
}

function sniffMime(bytes: Uint8Array, fallback: string): string {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "image/gif";
  if (bytes.length >= 12 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return "image/webp";
  }
  const head = new TextDecoder().decode(bytes.slice(0, 64)).trimStart();
  if (head.startsWith("<svg") || head.startsWith("<?xml")) return "image/svg+xml";
  if (fallback.startsWith("image/")) return fallback;
  return "image/jpeg";
}
