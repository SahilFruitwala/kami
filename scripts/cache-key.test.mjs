import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hashKeyPart } from "../src/lib/cache.server.ts";

// FNV-1a 32 — the previous hashKeyPart — for the regression check below.
function fnv1a(value) {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

describe("hashKeyPart", () => {
  it("is stable and compact", () => {
    assert.equal(hashKeyPart("https://example.com/a"), hashKeyPart("https://example.com/a"));
    assert.equal(hashKeyPart("x").length, 32);
    assert.match(hashKeyPart("x"), /^[A-Za-z0-9_-]+$/);
  });

  it("does not share keys between URLs that collide under a 32-bit hash", () => {
    // These two collide under FNV-1a 32: anyone could forge the second to
    // poison the shared link-preview cache entry of the first.
    const target = "https://www.amazon.com/dp/B0CHX1W1XY";
    const forged = "https://evil.example/p?6on7=\u7AC8";
    assert.equal(fnv1a(target), fnv1a(forged));
    assert.notEqual(hashKeyPart(target), hashKeyPart(forged));
  });
});
