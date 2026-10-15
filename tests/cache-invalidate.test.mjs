import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cached,
  invalidateUserCache,
  setCacheClientForTests,
  userFeatureKey,
} from "@/lib/cache.server";

/** Just enough of @upstash/redis for cache.server.ts. */
function fakeRedis() {
  const kv = new Map();
  const sets = new Map();
  const api = {
    kv,
    get: async (k) => (kv.has(k) ? kv.get(k) : null),
    set: async (k, v) => void kv.set(k, v),
    smembers: async (k) => [...(sets.get(k) ?? [])],
    del: async (...ks) => ks.forEach((k) => (kv.delete(k), sets.delete(k))),
    pipeline() {
      const ops = [];
      const p = {
        set: (...a) => (ops.push(() => api.set(...a)), p),
        sadd: (k, v) => (ops.push(() => sets.set(k, new Set([...(sets.get(k) ?? []), v]))), p),
        expire: () => p,
        del: (...ks) => (ops.push(() => api.del(...ks)), p),
        srem: (k, ...vs) => (ops.push(() => vs.forEach((v) => sets.get(k)?.delete(v))), p),
        exec: async () => {
          for (const op of ops) await op();
        },
      };
      return p;
    },
  };
  return api;
}

describe("invalidateUserCache", () => {
  it("drops only the written feature for that user", async () => {
    const redis = fakeRedis();
    setCacheClientForTests(redis);
    try {
      const put = (key) => cached(key, 60, async () => "v");
      await put(userFeatureKey("u1", "library", "page"));
      await put(userFeatureKey("u1", "shelves", "counts"));
      await put(userFeatureKey("u2", "library", "page"));
      // A user id that starts with another must not be caught by its prefix.
      await put(userFeatureKey("u1x", "library", "page"));

      await invalidateUserCache("u1", "library");

      assert.deepEqual([...redis.kv.keys()].sort(), [
        userFeatureKey("u1", "shelves", "counts"),
        userFeatureKey("u1x", "library", "page"),
        userFeatureKey("u2", "library", "page"),
      ]);
    } finally {
      setCacheClientForTests(undefined);
    }
  });

  it("is a no-op without Redis", async () => {
    setCacheClientForTests(null);
    await invalidateUserCache("u1", "journal");
    setCacheClientForTests(undefined);
  });
});
