import { createHash } from "node:crypto";
import { fetchImageBytes, sniffMime, type FetchedImage } from "./fetch-image.server.ts";
import { htmlImageSources, proxiedImageTarget } from "./image-url.ts";
import type { ObjectStore } from "./object-store.ts";
import { createR2Store, type R2Config } from "./r2.server.ts";

/**
 * Article images are copied into the private R2 bucket, so a saved article
 * keeps its pictures after the source site deletes, moves or hotlink-blocks
 * them. The bucket is never public: images only leave it through the
 * authenticated `/api/img` proxy, which first looks here and only then goes
 * to the source (storing what it gets). Saving an article warms the copy in
 * the background so it exists before anyone opens the article.
 *
 * Objects are keyed by a hash of the proxy's `u` (see `proxiedImageTarget`),
 * so readers who save the same image share one copy, and a key never carries
 * user input into the bucket path. Off unless the `R2_*` variables are set.
 * Tested in tests/image-store.test.mjs.
 */

type Env = Record<string, string | undefined>;

const read = (env: Env, name: string) => env[name]?.trim() || "";

/** R2 credentials for images: narration's, with `R2_IMAGE_BUCKET` optionally overriding the bucket. */
export function imageStoreConfig(env: Env = process.env): R2Config | null {
  const accountId = read(env, "R2_ACCOUNT_ID");
  const accessKeyId = read(env, "R2_ACCESS_KEY_ID");
  const secretAccessKey = read(env, "R2_SECRET_ACCESS_KEY");
  const bucket = read(env, "R2_IMAGE_BUCKET") || read(env, "R2_BUCKET");
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;
  return { accountId, accessKeyId, secretAccessKey, bucket };
}

let cachedStore: { store: ObjectStore | null } | null = null;

/** The image store for this process, or null when R2 isn't configured. */
export function imageStore(): ObjectStore | null {
  if (!cachedStore) {
    const cfg = imageStoreConfig();
    cachedStore = { store: cfg ? createR2Store(cfg) : null };
  }
  return cachedStore.store;
}

/** The object key for one proxied image. */
export function imageKey(target: string): string {
  return `images/${createHash("sha256").update(target).digest("hex")}`;
}

type Fetcher = (url: string) => Promise<FetchedImage>;

/** Bytes as served: never SVG, which runs scripts when opened from our origin. */
function asServed(bytes: Uint8Array): FetchedImage {
  const mime = sniffMime(bytes, "");
  if (mime === "image/svg+xml")
    return { ok: false, error: "svg images are not proxied", status: 415 };
  return { ok: true, bytes, mime };
}

/**
 * The image for `target`: the stored copy when there is one, else the
 * source's (kept for next time). Storage trouble never fails a read that the
 * source can still answer.
 */
export async function loadImage(
  store: ObjectStore | null,
  target: string,
  fetchImpl: Fetcher = fetchImageBytes,
): Promise<FetchedImage> {
  if (!store) return fetchImpl(target);
  const key = imageKey(target);
  try {
    const stored = await store.get(key);
    if (stored?.byteLength) return asServed(stored);
  } catch (err) {
    console.error("[image-store] read", key, err);
  }
  const fetched = await fetchImpl(target);
  if (fetched.ok) {
    await store.put(key, fetched.bytes, fetched.mime).catch((err) => {
      console.error("[image-store] write", key, err);
    });
  }
  return fetched;
}

/** At most this many images are copied per article; the rest copy when first viewed. */
export const MAX_WARM_IMAGES = 40;
const WARM_CONCURRENCY = 4;

/** The distinct proxy targets an article shows: its hero, then its body's images. */
export function articleImageTargets(contentHtml: string, heroImage?: string | null): string[] {
  const sources = [heroImage ?? "", ...htmlImageSources(contentHtml)];
  const targets = new Set<string>();
  for (const src of sources) {
    const target = proxiedImageTarget(src);
    if (target) targets.add(target);
  }
  return [...targets];
}

/** Copy the images not yet stored, a few at a time. Failures are skipped. */
export async function warmImages(
  store: ObjectStore,
  targets: string[],
  {
    fetchImpl = fetchImageBytes,
    limit = MAX_WARM_IMAGES,
  }: { fetchImpl?: Fetcher; limit?: number } = {},
): Promise<{ stored: number; present: number; failed: number }> {
  const queue = targets.slice(0, limit);
  const result = { stored: 0, present: 0, failed: 0 };
  const worker = async () => {
    for (let target = queue.shift(); target !== undefined; target = queue.shift()) {
      const key = imageKey(target);
      try {
        if (await store.has(key)) {
          result.present += 1;
          continue;
        }
        const fetched = await fetchImpl(target);
        if (!fetched.ok) {
          result.failed += 1;
          continue;
        }
        await store.put(key, fetched.bytes, fetched.mime);
        result.stored += 1;
      } catch (err) {
        result.failed += 1;
        console.error("[image-store] warm", key, err);
      }
    }
  };
  await Promise.all(Array.from({ length: WARM_CONCURRENCY }, worker));
  return result;
}
