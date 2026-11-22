import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readingCounts, readingDelta } from "../src/lib/compass/reading.ts";

const at = (currentPage, progressPercent) => ({ currentPage, progressPercent });

describe("readingDelta", () => {
  it("counts pages when both ends are tracked by page", () => {
    assert.deepEqual(readingDelta(at(40, 12), at(52, 15)), { delta: 12, unit: "pages" });
  });

  it("counts a first page update from an untouched book as pages", () => {
    assert.deepEqual(readingDelta(at(null, 0), at(30, 9)), { delta: 30, unit: "pages" });
  });

  it("goes negative when progress moves back", () => {
    assert.deepEqual(readingDelta(at(52, 15), at(45, 13)), { delta: -7, unit: "pages" });
  });

  it("falls back to percent when a book is tracked that way", () => {
    assert.deepEqual(readingDelta(at(null, 20), at(null, 35)), { delta: 15, unit: "percent" });
  });

  it("treats clearing progress as a step back to page 0", () => {
    assert.deepEqual(readingDelta(at(30, 9), at(null, 0)), { delta: -30, unit: "pages" });
  });

  it("is null when nothing moved", () => {
    assert.equal(readingDelta(at(40, 12), at(40, 12)), null);
    assert.equal(readingDelta(at(null, 20), at(null, 20)), null);
  });
});

describe("readingCounts", () => {
  it("counts any reading when there is no threshold", () => {
    assert.equal(readingCounts(1, "pages", null), true);
    assert.equal(readingCounts(0, "pages", null), false);
  });

  it("holds page amounts to the threshold", () => {
    assert.equal(readingCounts(9, "pages", 10), false);
    assert.equal(readingCounts(10, "pages", 10), true);
  });

  it("does not apply a page threshold to other units", () => {
    assert.equal(readingCounts(2, "percent", 10), true);
  });
});
