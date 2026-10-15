import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LIBRARY_LIMITS,
  articleToItem,
  clampLibraryItem,
  normalizeTag,
} from "../src/lib/library-item.ts";

const article = (over = {}) => ({
  url: "https://example.com/a",
  canonicalUrl: "https://example.com/a",
  title: "Title",
  author: "",
  siteName: "",
  published: null,
  excerpt: "",
  contentHtml: "",
  wordCount: 0,
  readingMinutes: 1,
  source: "blog",
  heroImage: null,
  ...over,
});

describe("clampLibraryItem", () => {
  it("cuts every field to LIBRARY_LIMITS", () => {
    const item = clampLibraryItem(
      articleToItem(article({ title: "x".repeat(900), excerpt: "e".repeat(9000) }), {
        tags: Array.from({ length: 30 }, (_, i) => `t${i}`),
        note: "n".repeat(5000),
      }),
    );
    assert.equal(item.title.length, LIBRARY_LIMITS.title);
    assert.equal(item.excerpt.length, LIBRARY_LIMITS.excerpt);
    assert.equal(item.tags.length, LIBRARY_LIMITS.tags);
    assert.equal(item.note.length, LIBRARY_LIMITS.note);
  });

  it("falls back to Untitled and drops oversize or non-http hero images", () => {
    assert.equal(clampLibraryItem(articleToItem(article({ title: "   " }))).title, "Untitled");
    const long = `https://example.com/${"i".repeat(LIBRARY_LIMITS.heroImage)}`;
    assert.equal(clampLibraryItem(articleToItem(article({ heroImage: long }))).heroImage, null);
    assert.equal(
      clampLibraryItem(articleToItem(article({ heroImage: "javascript:alert(1)" }))).heroImage,
      null,
    );
    const ok = "https://example.com/hero.jpg";
    assert.equal(clampLibraryItem(articleToItem(article({ heroImage: ok }))).heroImage, ok);
  });

  it("passes non-object input through for Zod to reject", () => {
    assert.equal(clampLibraryItem(null), null);
    assert.equal(clampLibraryItem("nope"), "nope");
  });
});

describe("normalizeTag", () => {
  it("collapses whitespace and caps length", () => {
    assert.equal(normalizeTag("  machine   learning "), "machine learning");
    assert.equal(normalizeTag("y".repeat(60)).length, LIBRARY_LIMITS.tagLength);
  });
});
