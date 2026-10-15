import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

// Minimal browser storage for the queue's persistence.
const store = new Map();
globalThis.window ??= {
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => void store.set(k, String(v)),
    removeItem: (k) => void store.delete(k),
  },
  addEventListener() {},
};

const { createSyncQueue, flushAllSyncQueues, pendingSyncCount, subscribeSyncQueues } =
  await import("@/lib/sync-queue");

const tick = () => new Promise((r) => setTimeout(r, 0));
const quiet = (fn) => async () => {
  const orig = console.error;
  console.error = () => {};
  try {
    await fn();
  } finally {
    console.error = orig;
  }
};
/** A runner whose ops fail until `ok` is flipped; records what ran. */
const runner = () => {
  const r = { ok: false, ran: [] };
  r.run = async (op) => {
    if (!r.ok) throw new Error("offline");
    r.ran.push(op);
  };
  return r;
};

beforeEach(() => store.clear());

describe("createSyncQueue", () => {
  it("drops writes before start (signed out)", async () => {
    const r = runner();
    r.ok = true;
    const q = createSyncQueue("t-stopped", r.run);
    q.sync("x", { n: 1 });
    await tick();
    assert.deepEqual(r.ran, []);
  });

  it(
    "queues failed ops and retries them in order",
    quiet(async () => {
      const r = runner();
      const q = createSyncQueue("t-retry", r.run);
      q.start("u1");
      q.sync("a", { n: 1 });
      q.sync("b", { n: 2 });
      await tick();
      assert.equal(q.pending(), 2);
      r.ok = true;
      assert.deepEqual(await q.flush(), { done: 2, failed: 0 });
      assert.deepEqual(r.ran, [{ n: 1 }, { n: 2 }]);
      assert.equal(store.get("kami-outbox:t-retry:u1"), undefined, "empty outbox clears storage");
    }),
  );

  it(
    "persists per user and replays only for that user",
    quiet(async () => {
      const r = runner();
      const q = createSyncQueue("t-persist", r.run);
      q.start("alice");
      q.sync("a", { n: 1 });
      await tick();
      assert.ok(store.get("kami-outbox:t-persist:alice"));

      // Reload: a fresh queue, a different user signs in first.
      q.stop();
      r.ok = true;
      const reloaded = createSyncQueue("t-persist", r.run);
      reloaded.start("bob");
      await tick();
      assert.deepEqual(r.ran, [], "bob never replays alice's writes");
      reloaded.stop();
      reloaded.start("alice");
      await tick();
      assert.deepEqual(r.ran, [{ n: 1 }]);
    }),
  );

  it("drops saved ops older than a week", async () => {
    const r = runner();
    r.ok = true;
    const old = Date.now() - 8 * 24 * 60 * 60_000;
    store.set(
      "kami-outbox:t-age:u1",
      JSON.stringify([
        { label: "old", op: { n: 1 }, at: old },
        { label: "new", op: { n: 2 }, at: Date.now() },
      ]),
    );
    createSyncQueue("t-age", r.run).start("u1");
    await tick();
    assert.deepEqual(r.ran, [{ n: 2 }]);
  });

  it(
    "saves a shrunk copy when storage is full",
    quiet(async () => {
      const r = runner();
      const q = createSyncQueue("t-shrink", r.run, { shrink: (op) => ({ ...op, body: "" }) });
      const setItem = window.localStorage.setItem;
      window.localStorage.setItem = (k, v) => {
        if (String(v).length > 200) throw new Error("QuotaExceededError");
        setItem(k, v);
      };
      try {
        q.start("u1");
        q.sync("big", { n: 1, body: "x".repeat(500) });
        await tick();
        const saved = JSON.parse(store.get("kami-outbox:t-shrink:u1"));
        assert.deepEqual(saved[0].op, { n: 1, body: "" });
      } finally {
        window.localStorage.setItem = setItem;
      }
    }),
  );

  it(
    "discard drops queued ops and their saved copy",
    quiet(async () => {
      const q = createSyncQueue("t-discard", runner().run);
      q.start("u1");
      q.sync("a", { n: 1 });
      await tick();
      q.discard();
      assert.equal(q.pending(), 0);
      assert.equal(store.get("kami-outbox:t-discard:u1"), undefined);
    }),
  );

  it(
    "reports the pending total across queues and flushes them all",
    quiet(async () => {
      const ra = runner();
      const rb = runner();
      const a = createSyncQueue("t-a", ra.run);
      const b = createSyncQueue("t-b", rb.run);
      a.start("u1");
      b.start("u1");
      const base = pendingSyncCount(); // other tests' queues share the registry
      const seen = [];
      const unsub = subscribeSyncQueues((n) => seen.push(n));
      a.sync("a", { n: 1 });
      b.sync("b", { n: 2 });
      await tick();
      assert.equal(pendingSyncCount(), base + 2);
      ra.ok = rb.ok = true;
      await flushAllSyncQueues();
      assert.equal(a.pending() + b.pending(), 0);
      assert.equal(seen.at(-1), pendingSyncCount());
      unsub();
    }),
  );
});
