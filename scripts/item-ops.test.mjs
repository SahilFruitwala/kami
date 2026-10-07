import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HIGHLIGHT_NOTE_MAX, applyHighlightOps, applyTagOps } from "../src/lib/item-ops.ts";

const h = (id, text) => ({ id, text, note: "", createdAt: 0, color: "vermilion" });

describe("applyTagOps", () => {
  it("merges edits made from two stale copies", () => {
    // Tab A adds "ai", tab B (unaware) adds "rust": both survive.
    const afterA = applyTagOps(["go"], [{ op: "add", tag: "ai" }]);
    const afterB = applyTagOps(afterA, [{ op: "add", tag: "rust" }]);
    assert.deepEqual(afterB, ["go", "ai", "rust"]);
  });

  it("is case-insensitive and de-duplicates renames", () => {
    assert.deepEqual(applyTagOps(["Go", "golang"], [{ op: "add", tag: "go" }]), ["Go", "golang"]);
    assert.deepEqual(applyTagOps(["Go", "golang"], [{ op: "rename", from: "golang", to: "go" }]), [
      "Go",
    ]);
    assert.deepEqual(applyTagOps(["Go"], [{ op: "remove", tag: "GO" }]), []);
  });
});

describe("applyHighlightOps", () => {
  it("adds newest first, ignores duplicates, updates and removes by id", () => {
    let list = applyHighlightOps([h("1", "first passage")], [{ op: "add", highlight: h("2", "second") }]);
    assert.deepEqual(list.map((x) => x.id), ["2", "1"]);
    list = applyHighlightOps(list, [{ op: "add", highlight: h("3", "second") }]);
    assert.equal(list.length, 2);
    list = applyHighlightOps(list, [{ op: "update", id: "1", color: "sumi", note: "n" }]);
    assert.equal(list[1].color, "sumi");
    assert.equal(list[1].note, "n");
    list = applyHighlightOps(list, [{ op: "remove", id: "2" }]);
    assert.deepEqual(list.map((x) => x.id), ["1"]);
  });

  it("restores an undone highlight in its original (newest-first) slot", () => {
    const at = (id, createdAt) => ({ ...h(id, `passage ${id}`), createdAt });
    const list = [at("c", 30), at("a", 10)];
    const restored = applyHighlightOps(list, [{ op: "add", highlight: at("b", 20) }]);
    assert.deepEqual(restored.map((x) => x.id), ["c", "b", "a"]);
    const oldest = applyHighlightOps(list, [{ op: "add", highlight: at("z", 1) }]);
    assert.deepEqual(oldest.map((x) => x.id), ["c", "a", "z"]);
  });

  it("caps notes at HIGHLIGHT_NOTE_MAX", () => {
    const list = applyHighlightOps([h("1", "a passage")], [
      { op: "update", id: "1", note: "x".repeat(HIGHLIGHT_NOTE_MAX + 50) },
    ]);
    assert.equal(list[0].note.length, HIGHLIGHT_NOTE_MAX);
  });
});
