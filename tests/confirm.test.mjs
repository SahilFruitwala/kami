import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { confirmAction, currentConfirm, settleConfirm, subscribeConfirm } from "@/lib/confirm";

describe("confirmAction", () => {
  it("resolves false without a host or a browser", async () => {
    assert.equal(await confirmAction({ title: "Delete?" }), false);
  });

  it("opens one request at a time and resolves with the answer", async () => {
    const seen = [];
    const unsub = subscribeConfirm(() => seen.push(currentConfirm()?.title ?? null));
    try {
      const first = confirmAction({ title: "First?" });
      const second = confirmAction({ title: "Second?" });
      assert.equal(await first, false, "a newer request cancels the open one");
      assert.equal(currentConfirm()?.title, "Second?");
      settleConfirm(true);
      assert.equal(await second, true);
      assert.equal(currentConfirm(), null);
      assert.deepEqual(seen, ["First?", "Second?", null]);
    } finally {
      unsub();
    }
  });
});
