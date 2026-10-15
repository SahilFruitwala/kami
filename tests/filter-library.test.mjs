import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { nextInQueue } from "@/lib/filter-library";

const row = (id, savedAt, archived = false) => ({ id, savedAt, archived });

/** The old implementation, kept as the reference. */
function reference(library, id) {
  const sorted = [...library].filter((r) => !r.archived).sort((a, b) => b.savedAt - a.savedAt);
  const idx = sorted.findIndex((r) => r.id === id);
  return idx >= 0 ? (sorted[idx + 1] ?? sorted[0] ?? null) : null;
}

describe("nextInQueue", () => {
  it("matches the sort-based version, including ties and wrap-around", () => {
    const lib = [
      row("a", 5),
      row("b", 9),
      row("c", 5),
      row("d", 1, true),
      row("e", 7),
      row("f", 5),
    ];
    for (const id of ["a", "b", "c", "d", "e", "f", "missing"]) {
      assert.equal(nextInQueue(lib, id), reference(lib, id), id);
    }
  });

  it("matches on random libraries", () => {
    for (let n = 0; n < 200; n++) {
      const lib = Array.from({ length: 1 + (n % 12) }, (_, i) =>
        row(`r${i}`, Math.floor(Math.random() * 4), Math.random() < 0.3),
      );
      for (const r of lib) assert.equal(nextInQueue(lib, r.id), reference(lib, r.id));
    }
  });
});
