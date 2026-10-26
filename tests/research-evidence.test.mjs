import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAX_CHUNKS_PER_PAGE,
  authorKey,
  cleanNames,
  parsePostedAt,
  selectChunks,
} from "../src/lib/research/evidence.ts";

describe("selectChunks", () => {
  const para = (text) => `${text} ${"filler text ".repeat(240)}`;

  it("keeps chunks about the seed or about problems, in page order", () => {
    const md = [
      para("Welcome to our community guidelines."),
      para("Podcast editing is so frustrating and slow."),
      para("Our office is open on weekdays."),
      para("Anyone know a better podcast tool?"),
    ].join("\n\n");
    const chunks = selectChunks(md, "indie podcast editing");
    assert.equal(chunks.length, 2);
    assert.match(chunks[0], /^Podcast editing is so frustrating/);
    assert.match(chunks[1], /^Anyone know/);
  });

  it("caps how many chunks of one page are sent", () => {
    const md = Array.from({ length: 12 }, (_, i) => para(`Podcast problem number ${i}.`)).join(
      "\n\n",
    );
    assert.equal(selectChunks(md, "podcast").length, MAX_CHUNKS_PER_PAGE);
  });

  it("still sends the first chunk of a page that never trips the filter", () => {
    assert.deepEqual(selectChunks("Five stars. Love it.", "podcast editing"), [
      "Five stars. Love it.",
    ]);
  });
});

describe("evidence fields", () => {
  it("cleans product names", () => {
    assert.deepEqual(cleanNames([" Descript ", "descript", "", "Riverside  FM"]), [
      "Descript",
      "Riverside FM",
    ]);
    assert.equal(cleanNames(Array.from({ length: 20 }, (_, i) => `P${i}`)).length, 10);
    assert.deepEqual(cleanNames(null), []);
  });

  it("hashes authors per site, folding u/ and @, and never keeps the handle", () => {
    const k = authorKey("reddit.com", "u/PodGuy");
    assert.equal(k, authorKey("reddit.com", "podguy"));
    assert.equal(k, authorKey("reddit.com", "@PodGuy"));
    assert.notEqual(k, authorKey("news.ycombinator.com", "podguy"));
    assert.notEqual(authorKey("reddit.com", "user123"), authorKey("reddit.com", "ser123"));
    assert.ok(!k.includes("podguy"));
    assert.equal(authorKey("reddit.com", "[deleted]"), null);
    assert.equal(authorKey("reddit.com", "  "), null);
  });

  it("reads plausible dates only", () => {
    const now = Date.UTC(2026, 9, 26);
    assert.equal(parsePostedAt("2025-03-04", now)?.toISOString(), "2025-03-04T00:00:00.000Z");
    assert.equal(parsePostedAt("2030-01-01", now), null);
    assert.equal(parsePostedAt("yesterday", now), null);
    assert.equal(parsePostedAt("1990-01-01", now), null);
    assert.equal(parsePostedAt(null, now), null);
  });
});
