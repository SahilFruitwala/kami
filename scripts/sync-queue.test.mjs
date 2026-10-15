import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createSyncQueue,
  flushAllSyncQueues,
  pendingSyncCount,
  subscribeSyncQueues,
} from "../src/lib/sync-queue.ts";

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

describe("createSyncQueue", () => {
  it("drops writes while disabled", async () => {
    const q = createSyncQueue("t-disabled");
    let ran = 0;
    q.sync("x", async () => void ran++);
    await tick();
    assert.equal(ran, 0);
    assert.equal(q.pending(), 0);
  });

  it(
    "queues a failed write and retries it in order on flush",
    quiet(async () => {
      const q = createSyncQueue("t-retry");
      q.setEnabled(true);
      const order = [];
      let fail = true;
      const task = (n) => async () => {
        if (fail) throw new Error("offline");
        order.push(n);
      };
      q.sync("a", task(1));
      q.sync("b", task(2));
      await tick();
      assert.equal(q.pending(), 2);
      fail = false;
      assert.deepEqual(await q.flush(), { done: 2, failed: 0 });
      assert.deepEqual(order, [1, 2]);
      assert.equal(q.pending(), 0);
    }),
  );

  it(
    "reports the pending total across queues and flushes them all",
    quiet(async () => {
      const a = createSyncQueue("t-a");
      const b = createSyncQueue("t-b");
      a.setEnabled(true);
      b.setEnabled(true);
      const seen = [];
      const unsub = subscribeSyncQueues((n) => seen.push(n));
      let fail = true;
      const task = async () => {
        if (fail) throw new Error("nope");
      };
      a.sync("a", task);
      b.sync("b", task);
      await tick();
      assert.equal(pendingSyncCount(), 2);
      fail = false;
      const result = await flushAllSyncQueues();
      assert.equal(result.failed, 0);
      assert.equal(pendingSyncCount(), 0);
      assert.equal(seen.at(-1), 0);
      unsub();
    }),
  );
});
