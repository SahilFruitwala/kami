import "@tanstack/react-start/server-only";
import { createHash } from "node:crypto";
import { fetchImageBytes } from "@/lib/fetch-image.server.ts";
import { getObjectStorage } from "@/lib/object-storage.server.ts";
import { MEDIA_PATH_PREFIX, repairMangledImageUrl } from "@/lib/image-url.ts";

/**
 * Keep our own copy of an article's images. Called when an article is saved:
 * each remote `<img src>` (and the hero image) is fetched once, written to
 * object storage under the user's prefix, and the stored HTML is rewritten to
 * point at `/api/media/<hash>.<ext>` — so the article still renders after the
 * original blog is deleted. Best effort: an image that can't be fetched or
 * stored keeps its original URL, and nothing happens without storage env vars.
 */

const MAX_IMAGES_PER_ARTICLE = 40;
const CONCURRENCY = 4;
/** Stop starting new downloads after this long so a save stays responsive. */
const TIME_BUDGET_MS = 20_000;

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
};

export const MEDIA_NAME_RE = /^[a-f0-9]{64}\.(jpg|png|gif|webp|avif)$/;

export function mediaKey(userId: string, name: string): string {
  return `u/${userId}/img/${name}`;
}

function isRemote(src: string): boolean {
  return /^https?:\/\//i.test(src);
}

async function mirrorOne(userId: string, remoteUrl: string): Promise<string | null> {
  const storage = getObjectStorage();
  if (!storage) return null;
  const fetched = await fetchImageBytes(repairMangledImageUrl(remoteUrl));
  if (!fetched.ok) return null;
  const ext = EXT_BY_MIME[fetched.mime];
  if (!ext) return null;
  // Content-addressed: the same image saved twice (or in two articles) is one object.
  const name = `${createHash("sha256").update(fetched.bytes).digest("hex")}.${ext}`;
  try {
    await storage.put(mediaKey(userId, name), fetched.bytes, fetched.mime);
  } catch {
    return null;
  }
  return `${MEDIA_PATH_PREFIX}${name}`;
}

/** Mirror `urls` (deduped, capped); returns original URL → `/api/media/…`. */
async function mirrorMany(userId: string, urls: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const queue = [...new Set(urls)].slice(0, MAX_IMAGES_PER_ARTICLE);
  const deadline = Date.now() + TIME_BUDGET_MS;
  const worker = async () => {
    for (let url = queue.shift(); url; url = queue.shift()) {
      if (Date.now() > deadline) return;
      const local = await mirrorOne(userId, url);
      if (local) out.set(url, local);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return out;
}

function unescapeAttr(value: string): string {
  return value.replace(/&amp;/g, "&");
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

export async function mirrorArticleImages(
  userId: string,
  contentHtml: string,
  heroImage: string | null,
): Promise<{ contentHtml: string; heroImage: string | null }> {
  if (!getObjectStorage()) return { contentHtml, heroImage };

  const srcRe = /(<img\b[^>]*?\ssrc\s*=\s*)(["'])(.*?)\2/gi;
  const remote: string[] = [];
  for (const m of contentHtml.matchAll(srcRe)) {
    const src = unescapeAttr(m[3]);
    if (isRemote(src)) remote.push(src);
  }
  if (heroImage && isRemote(heroImage)) remote.push(heroImage);
  if (!remote.length) return { contentHtml, heroImage };

  const mirrored = await mirrorMany(userId, remote);
  if (!mirrored.size) return { contentHtml, heroImage };

  return {
    contentHtml: contentHtml.replace(srcRe, (full, pre: string, quote: string, raw: string) => {
      const local = mirrored.get(unescapeAttr(raw));
      return local ? `${pre}${quote}${escapeAttr(local)}${quote}` : full;
    }),
    heroImage: heroImage ? (mirrored.get(heroImage) ?? heroImage) : null,
  };
}
