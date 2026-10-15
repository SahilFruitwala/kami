import { createHash } from "node:crypto";
import { Redis } from "@upstash/redis";

/**
 * Optional Upstash Redis cache for hot server reads + external lookups.
 *
 * - Enabled when either `UPSTASH_REDIS_REST_URL` +
 *   `UPSTASH_REDIS_REST_TOKEN` or the legacy `UPSTASH_URL` +
 *   `UPSTASH_TOKEN` pair are set; otherwise every helper is a transparent
 *   no-op (local dev and CI keep working with zero cache config).
 * - All values are JSON. TTLs are short for user data (stale reads are
 *   bounded) and long for third-party lookups (TMDB / Open Library /
 *   link previews barely change).
 * - Keys are namespaced (`quarto:v1:...`) and user-scoped where the data
 *   is per-account, so tenants can never read each other's entries.
 */

const NAMESPACE = "quarto:v1";

let client: Redis | null | undefined;

function getClient(): Redis | null {
  if (client !== undefined) return client;
  // Prefer Upstash's official REST names, but accept the shorter names used
  // by existing Vercel projects too.
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.UPSTASH_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.UPSTASH_TOKEN;
  if (!url || !token) {
    client = null;
    return client;
  }
  client = new Redis({ url, token });
  return client;
}

/** Swap the Redis client (tests use an in-memory stand-in; `undefined` re-reads env). */
export function setCacheClientForTests(next: Redis | null | undefined): void {
  client = next;
}

/** Build a namespaced key: `quarto:v1:<part>:<part>...` */
export function cacheKey(...parts: string[]): string {
  return [NAMESPACE, ...parts].join(":");
}

/** Normalize free-text queries so "Dune", "dune " hit the same entry. */
export function normalizeCacheQuery(q: string, max = 200): string {
  return q.trim().toLowerCase().slice(0, max);
}

/**
 * Hash long key parts (URLs, queries) to keep keys short. Cryptographic on
 * purpose: some caches are shared across users (link previews), and a weak
 * 32-bit hash let anyone craft a URL whose key collides with a popular one in
 * milliseconds — poisoning that entry for everyone for days.
 */
export function hashKeyPart(value: string): string {
  return createHash("sha256").update(value).digest("base64url").slice(0, 32);
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = getClient();
  if (!redis) return null;
  try {
    const value = await redis.get<T>(key);
    return value ?? null;
  } catch (err) {
    console.warn("[cache] get failed:", err);
    return null;
  }
}

/** Key of the set that indexes one user's cached keys. */
function userIndexKey(userId: string): string {
  return cacheKey("idx", "u", userId);
}

/** `quarto:v1:u:<userId>:...` → userId, else null (shared/global keys). */
function userIdOfKey(key: string): string | null {
  const prefix = `${NAMESPACE}:u:`;
  if (!key.startsWith(prefix)) return null;
  const end = key.indexOf(":", prefix.length);
  return end > prefix.length ? key.slice(prefix.length, end) : null;
}

/** Index lifetime: comfortably longer than any per-user value TTL. */
const USER_INDEX_TTL_SECONDS = 24 * 3600;

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const redis = getClient();
  if (!redis) return;
  try {
    const userId = userIdOfKey(key);
    if (!userId) {
      await redis.set(key, value, { ex: ttlSeconds });
      return;
    }
    // Record per-user keys in a set so invalidation can delete exactly this
    // user's entries without scanning the whole keyspace.
    const index = userIndexKey(userId);
    await redis
      .pipeline()
      .set(key, value, { ex: ttlSeconds })
      .sadd(index, key)
      .expire(index, USER_INDEX_TTL_SECONDS)
      .exec();
  } catch (err) {
    console.warn("[cache] set failed:", err);
  }
}

/**
 * Read-through helper: return the cached value on hit, otherwise run
 * `fetcher`, cache its result, and return it. Cache (or fetcher) failures
 * never throw — callers always get live data as a fallback.
 */
export async function cached<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>,
  opts?: { skipCache?: (value: T) => boolean },
): Promise<T> {
  const hit = await cacheGet<T>(key);
  if (hit !== null) return hit;
  const fresh = await fetcher();
  if (!opts?.skipCache?.(fresh)) {
    await cacheSet(key, fresh, ttlSeconds);
  }
  return fresh;
}

/** Per-user cached features: the third key part, `quarto:v1:u:<userId>:<feature>:…`. */
export type UserCacheFeature = "library" | "shelves" | "journal";

/** Key prefix for one user's cached reads of a feature. */
export function userFeatureKey(userId: string, feature: UserCacheFeature, ...parts: string[]) {
  return cacheKey("u", userId, feature, ...parts);
}

/**
 * Drop one user's cached reads of `feature` after they write to it, leaving
 * their other features cached (marking a feed entry read no longer evicts
 * shelves and library pages).
 *
 * Cost is O(that user's cached keys): one SMEMBERS on the user's index set,
 * one DEL and one SREM — no keyspace scan.
 */
export async function invalidateUserCache(
  userId: string,
  feature: UserCacheFeature,
): Promise<void> {
  const redis = getClient();
  if (!redis) return;
  try {
    const index = userIndexKey(userId);
    const prefix = `${userFeatureKey(userId, feature)}:`;
    const keys = (await redis.smembers(index)).filter((k) => k.startsWith(prefix));
    if (keys.length === 0) return;
    await redis
      .pipeline()
      .del(...keys)
      .srem(index, ...keys)
      .exec();
  } catch (err) {
    console.warn("[cache] invalidate failed:", err);
  }
}

// ---------- TTL policy (seconds) ----------

export const CacheTTL = {
  /** Per-user shelf counts / lists / detail — invalidated on write. */
  shelfReads: 60,
  /** Per-user journal entries — invalidated on write. */
  journal: 120,
  /**
   * Per-user library metadata snapshot (no article bodies). Short TTL:
   * mutations are frequent; the win is absorbing burst refetches
   * (navigation remounts, multi-tab boots).
   */
  library: 60,
  /** TMDB movie/TV search — catalog data, stable for hours. */
  tmdbSearch: 6 * 3600,
  /** TMDB watch providers — availability changes slowly. */
  watchProviders: 24 * 3600,
  /** Open Library book search — catalog data, stable for hours. */
  bookSearch: 6 * 3600,
  /** og:title/og:image previews — page metadata rarely changes. */
  linkPreview: 7 * 24 * 3600,
} as const;

/**
 * Rough byte size of a JSON value. Used to keep huge payloads (a library
 * with megabytes of `contentHtml`) out of Redis, where a single giant
 * value would hurt more than it helps.
 */
export function approxJsonBytes(value: unknown): number {
  try {
    return JSON.stringify(value)?.length ?? Number.MAX_SAFE_INTEGER;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

/** Max snapshot bytes we'll store (Upstash values should stay small). */
export const MAX_CACHED_SNAPSHOT_BYTES = 800_000;
