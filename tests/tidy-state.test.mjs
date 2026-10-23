import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { asTidyState, onRestore, onSave, onTidy, wantsTidy } from "../src/lib/tidy-state.ts";

const CAPTURED = "<p>Story.</p><p>Sponsor.</p><p>Subscribe!</p>";
const TIDIED = "<p>Story.</p>";

const tidied = { contentHtml: TIDIED, originalHtml: CAPTURED, tidyState: "tidied" };

describe("onSave", () => {
  it("starts a new article as pending", () => {
    assert.deepEqual(onSave(null, CAPTURED), {
      contentHtml: CAPTURED,
      originalHtml: null,
      tidyState: "pending",
    });
  });

  it("keeps the stored copy when a save carries no body (lean sync)", () => {
    assert.equal(onSave(tidied, ""), tidied);
    assert.equal(onSave(tidied, "   "), tidied);
  });

  it("ignores a client echoing the current body", () => {
    assert.equal(onSave(tidied, TIDIED), tidied);
  });

  it("keeps the tidied copy when a client echoes the pre-tidy body", () => {
    assert.equal(onSave(tidied, CAPTURED), tidied);
  });

  it("re-tidies a genuinely new body (re-capture, upgraded link)", () => {
    const fresh = "<p>Story, revised.</p><p>Footer.</p>";
    assert.deepEqual(onSave(tidied, fresh), {
      contentHtml: fresh,
      originalHtml: null,
      tidyState: "pending",
    });
  });
});

describe("onTidy", () => {
  const pending = { contentHtml: CAPTURED, originalHtml: null, tidyState: "pending" };

  it("stores the tidied body and keeps the Original copy", () => {
    assert.deepEqual(onTidy(pending, { kind: "removed", contentHtml: TIDIED }), tidied);
  });

  it("keeps the first Original copy across a second Tidy", () => {
    const again = onTidy(tidied, { kind: "removed", contentHtml: "<p>S.</p>" });
    assert.equal(again.originalHtml, CAPTURED);
  });

  it("marks tidied without an Original copy when nothing was removed", () => {
    assert.deepEqual(onTidy(pending, { kind: "nothing" }), { ...pending, tidyState: "tidied" });
  });

  it("marks skipped when Tidy refuses (too short, or would gut the piece)", () => {
    assert.deepEqual(onTidy(pending, { kind: "refused" }), { ...pending, tidyState: "skipped" });
  });

  it("marks failed and leaves the body alone on a model error", () => {
    assert.deepEqual(onTidy(pending, { kind: "failed" }), { ...pending, tidyState: "failed" });
  });

  it("retrying a failed Tidy can succeed", () => {
    const failed = onTidy(pending, { kind: "failed" });
    assert.deepEqual(onTidy(failed, { kind: "removed", contentHtml: TIDIED }), tidied);
  });
});

describe("onRestore", () => {
  it("puts the Original copy back byte for byte", () => {
    assert.deepEqual(onRestore(tidied), {
      contentHtml: CAPTURED,
      originalHtml: null,
      tidyState: "restored",
    });
  });

  it("is a no-op without an Original copy", () => {
    const plain = { contentHtml: CAPTURED, originalHtml: null, tidyState: "skipped" };
    assert.equal(onRestore(plain), plain);
  });

  it("a restored copy re-tidies only after a new body arrives", () => {
    const restored = onRestore(tidied);
    assert.equal(wantsTidy(restored.tidyState), false);
    assert.equal(onSave(restored, CAPTURED), restored);
  });
});

describe("wantsTidy and asTidyState", () => {
  it("only pending articles are tidied automatically", () => {
    assert.deepEqual(["pending", "tidied", "skipped", "failed", "restored"].filter(wantsTidy), [
      "pending",
    ]);
  });

  it("reads unknown values as pending", () => {
    assert.equal(asTidyState("tidied"), "tidied");
    assert.equal(asTidyState("bogus"), "pending");
    assert.equal(asTidyState(null), "pending");
  });
});
